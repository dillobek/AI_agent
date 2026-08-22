import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { api } from '../api/client';
import { arrayBufferToBase64, base64ToArrayBuffer } from '../lib/audio/pcm-codec';

export type VoiceStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

export interface VoiceTranscriptMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  at: number;
}

/** Shape of `POST /voice/live-token`'s response (see src/voice/voice.service.ts on the backend). */
interface LiveTokenResponse {
  token: string;
  expireTime: string;
  model: string;
  tools: Array<{ name: string; description: string; parameters: unknown }>;
  systemInstruction: string;
}

/**
 * The subset of @google/genai's Live session object and server-message
 * shape this hook actually reads/calls, declared locally rather than
 * imported by name from the package — field names below are taken
 * verbatim from Google's own Gemini Live API docs (ai.live.connect,
 * sendRealtimeInput, sendToolResponse, serverContent.interrupted/
 * turnComplete, in/outputTranscription), but the exact TypeScript type
 * names the installed SDK version exports for them were not independently
 * confirmed in this environment — see the M6 delivery notes' verification
 * checklist. `connect()` below casts through these at the SDK boundary so
 * a real field-name mismatch surfaces at runtime (visibly, in
 * onerror/a rejected call) rather than as a compile error blocking
 * everything else in this file.
 */
interface LiveSession {
  close(): void;
  sendRealtimeInput(input: { audio: { data: string; mimeType: string } }): void;
  sendToolResponse(input: { functionResponses: Array<{ id: string; name: string; response: { result: string } }> }): void;
}

interface LiveFunctionCall {
  id: string;
  name: string;
  args?: Record<string, unknown>;
}

interface LiveServerMessage {
  toolCall?: { functionCalls: LiveFunctionCall[] };
  toolCallCancellation?: { ids: string[] };
  serverContent?: {
    interrupted?: boolean;
    turnComplete?: boolean;
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    modelTurn?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
  };
}

const RECORD_SAMPLE_RATE = 16000;
const PLAYBACK_SAMPLE_RATE = 24000;
// Rotate to a fresh token/session this long before the current one
// actually expires, so a long conversation doesn't get cut off mid-turn.
const TOKEN_REFRESH_SAFETY_MARGIN_MS = 60_000;
// A dropped connection gets a few silent reconnect attempts before giving
// up and surfacing an error the user has to act on.
const MAX_RECONNECT_ATTEMPTS = 3;

let idCounter = 0;
const nextId = () => `v${++idCounter}`;

function describeError(err: unknown): { message: string; moduleDisabled: boolean } {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 503) {
    return {
      message: 'The Voice assistant module is disabled. Enable VOICE_ENABLED in your .env to use this page.',
      moduleDisabled: true,
    };
  }
  if (err instanceof DOMException && err.name === 'NotAllowedError') {
    return { message: 'Microphone access was not granted.', moduleDisabled: false };
  }
  if (err instanceof DOMException && err.name === 'NotFoundError') {
    return { message: 'No microphone was found. Connect or select a microphone, then try again.', moduleDisabled: false };
  }
  if (err instanceof DOMException && err.name === 'NotReadableError') {
    return { message: 'The microphone is busy or unavailable. Close apps such as Telegram, Zoom, or a browser tab that may be using it, then try again.', moduleDisabled: false };
  }
  if (err instanceof DOMException && err.name === 'SecurityError') {
    return { message: 'Microphone access requires a secure HTTPS connection.', moduleDisabled: false };
  }
  if (err instanceof DOMException && err.name === 'OverconstrainedError') {
    return { message: 'This microphone does not support the requested audio settings. Try again to use the browser defaults.', moduleDisabled: false };
  }
  return { message: 'Could not start the voice session. Check your connection and try again.', moduleDisabled: false };
}

/**
 * Owns a real-time Gemini Live voice session end to end: mints an
 * ephemeral token from this app's own backend (`POST /voice/live-token`,
 * never touching the real `GEMINI_API_KEY`), opens a direct
 * browser-to-Gemini WebSocket with it, streams microphone audio in via an
 * AudioWorklet, streams the model's audio reply back out via a second
 * AudioWorklet, relays any tool calls Gemini Live decides to make to
 * `POST /voice/execute-tool`, and keeps a text transcript of both sides
 * from the input/output audio transcription Gemini Live provides
 * alongside the audio.
 *
 * The two AudioContexts (capture at 16kHz, playback at 24kHz — see the
 * worklet files for why those exact rates) are only ever constructed
 * inside `start()`, which only ever runs from a user gesture (the
 * push-to-talk button) — constructing them eagerly on mount would hit
 * browser autoplay-policy restrictions.
 */
export function useVoiceSession() {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [moduleDisabled, setModuleDisabled] = useState(false);
  const [transcript, setTranscript] = useState<VoiceTranscriptMessage[]>([]);

  const sessionRef = useRef<LiveSession | null>(null);
  const recordingCtxRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const recorderNodeRef = useRef<AudioWorkletNode | null>(null);
  const playerNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  // true whenever the user hasn't asked to be connected — guards every
  // async callback (onopen/onmessage/onclose/refresh) from acting after
  // stop() has already torn things down.
  const stoppedRef = useRef(true);

  const currentInputTranscript = useRef('');
  const currentOutputTranscript = useRef('');

  const pushTranscript = useCallback((role: 'user' | 'agent', text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTranscript((prev) => [...prev, { id: nextId(), role, text: trimmed, at: Date.now() }]);
  }, []);

  const flushTurn = useCallback(() => {
    if (currentInputTranscript.current) {
      pushTranscript('user', currentInputTranscript.current);
      currentInputTranscript.current = '';
    }
    if (currentOutputTranscript.current) {
      pushTranscript('agent', currentOutputTranscript.current);
      currentOutputTranscript.current = '';
    }
  }, [pushTranscript]);

  const teardownAudio = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    recorderNodeRef.current?.port.close();
    recorderNodeRef.current?.disconnect();
    recorderNodeRef.current = null;

    playerNodeRef.current?.port.close();
    playerNodeRef.current?.disconnect();
    playerNodeRef.current = null;

    void recordingCtxRef.current?.close().catch(() => {});
    void playbackCtxRef.current?.close().catch(() => {});
    recordingCtxRef.current = null;
    playbackCtxRef.current = null;
  }, []);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    flushTurn();
    try {
      sessionRef.current?.close();
    } catch {
      // Best-effort close — the session may already be gone.
    }
    sessionRef.current = null;
    teardownAudio();
    setStatus('idle');
  }, [flushTurn, teardownAudio]);

  // Always unwind the mic/session on unmount — leaving a live microphone
  // stream running after the user navigates away is a privacy problem,
  // not just a resource leak.
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => () => stopRef.current(), []);

  // A backgrounded tab can auto-suspend an AudioContext in some browsers;
  // resume it on return rather than leaving audio silently dead.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void recordingCtxRef.current?.resume().catch(() => {});
        void playbackCtxRef.current?.resume().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const executeToolCall = useCallback(async (functionCall: LiveFunctionCall) => {
    try {
      const res = await api.post<{ callId: string; result: string }>('/voice/execute-tool', {
        toolName: functionCall.name,
        args: functionCall.args ?? {},
        callId: functionCall.id,
      });
      return res.data.result;
    } catch {
      return `Tool "${functionCall.name}" could not be reached — try again.`;
    }
  }, []);

  const handleMessage = useCallback(
    async (message: LiveServerMessage) => {
      if (message.toolCall?.functionCalls?.length) {
        const responses = await Promise.all(
          message.toolCall.functionCalls.map(async (fc) => ({
            id: fc.id,
            name: fc.name,
            response: { result: await executeToolCall(fc) },
          })),
        );
        sessionRef.current?.sendToolResponse({ functionResponses: responses });
        return;
      }

      if (message.toolCallCancellation) {
        // A function call may have been canceled server-side (e.g. the
        // user interrupted before it returned). The relayed HTTP call
        // isn't aborted — ToolExecutionService already bounds it with its
        // own timeout — this just means we won't act on a stale result.
        return;
      }

      const content = message.serverContent;
      if (!content) return;

      if (content.interrupted) {
        playerNodeRef.current?.port.postMessage({ type: 'clear' });
      }

      if (content.inputTranscription?.text) {
        currentInputTranscript.current += content.inputTranscription.text;
      }
      if (content.outputTranscription?.text) {
        currentOutputTranscript.current += content.outputTranscription.text;
      }

      const parts = content.modelTurn?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          const buffer = base64ToArrayBuffer(part.inlineData.data);
          playerNodeRef.current?.port.postMessage(buffer, [buffer]);
        }
      }

      if (content.turnComplete) {
        flushTurn();
      }
    },
    [executeToolCall, flushTurn],
  );

  const scheduleRefresh = useCallback((expireTime: string, onRefresh: () => void) => {
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
    const delay = new Date(expireTime).getTime() - Date.now() - TOKEN_REFRESH_SAFETY_MARGIN_MS;
    refreshTimerRef.current = window.setTimeout(onRefresh, Math.max(delay, 5000));
  }, []);

  const connect = useCallback(async () => {
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch {
        // Replacing a still-open session (proactive refresh) — best-effort close.
      }
      sessionRef.current = null;
    }

    const { data: liveToken } = await api.post<LiveTokenResponse>('/voice/live-token');
    if (stoppedRef.current) return;

    const ai = new GoogleGenAI({ apiKey: liveToken.token });

    // Built as a plain object (not passed inline) and cast through
    // `unknown` at the actual call below — see the LiveSession/
    // LiveServerMessage doc comment above for why: the field names here
    // come verbatim from Google's Live API docs, but the SDK's exact
    // TypeScript parameter/return type names were not independently
    // confirmed in this environment, so this is the one boundary where a
    // real mismatch would need to surface at runtime instead of here.
    const connectOptions = {
      model: liveToken.model,
      callbacks: {
        onopen: () => {
          if (stoppedRef.current) return;
          reconnectAttemptsRef.current = 0;
          setStatus('listening');
        },
        onmessage: (message: LiveServerMessage) => {
          if (stoppedRef.current) return;
          void handleMessage(message);
        },
        onerror: () => {
          if (stoppedRef.current) return;
          setStatus('error');
          setError('A voice connection error occurred.');
        },
        onclose: () => {
          if (stoppedRef.current) return;
          reconnectAttemptsRef.current += 1;
          if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
            stoppedRef.current = true;
            teardownAudio();
            setStatus('error');
            setError('The connection was lost. Press start to try again.');
            return;
          }
          // The server or network closed the session unexpectedly (not via
          // our own stop()) — reconnect silently rather than dropping the
          // user out of a conversation for a transient blip.
          setStatus('connecting');
          void connect().catch(() => {
            if (stoppedRef.current) return;
            setStatus('error');
            setError('Could not reconnect the voice session.');
          });
        },
      },
      config: {
        responseModalities: ['AUDIO'],
        systemInstruction: liveToken.systemInstruction,
        tools: liveToken.tools.length ? [{ functionDeclarations: liveToken.tools }] : undefined,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
    };

    const session = (await ai.live.connect(connectOptions as unknown as Parameters<typeof ai.live.connect>[0])) as unknown as LiveSession;

    if (stoppedRef.current) {
      try {
        session.close();
      } catch {
        // start() was stopped while this connect() was in flight — discard.
      }
      return;
    }

    sessionRef.current = session;
    scheduleRefresh(liveToken.expireTime, () => {
      if (stoppedRef.current) return;
      void connect().catch(() => {
        if (stoppedRef.current) return;
        setStatus('error');
        setError('Could not refresh the voice session.');
      });
    });
  }, [handleMessage, scheduleRefresh, teardownAudio]);

  const start = useCallback(async () => {
    if (!stoppedRef.current) return; // already running
    stoppedRef.current = false;
    reconnectAttemptsRef.current = 0;
    setError(null);
    setModuleDisabled(false);
    setTranscript([]);
    currentInputTranscript.current = '';
    currentOutputTranscript.current = '';
    setStatus('connecting');

    try {
      // Request the browser's default microphone configuration. Constraining a
      // device to a single channel can reject otherwise working Windows/USB
      // microphones before the Live API request even begins.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (stoppedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      const recordingCtx = new AudioContext({ sampleRate: RECORD_SAMPLE_RATE });
      await recordingCtx.audioWorklet.addModule(new URL('../lib/audio/pcm-recorder-worklet.ts', import.meta.url).href);
      const micSource = recordingCtx.createMediaStreamSource(stream);
      const recorderNode = new AudioWorkletNode(recordingCtx, 'pcm-recorder-worklet', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      recorderNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (stoppedRef.current || !sessionRef.current) return;
        sessionRef.current.sendRealtimeInput({
          audio: { data: arrayBufferToBase64(event.data), mimeType: `audio/pcm;rate=${RECORD_SAMPLE_RATE}` },
        });
      };
      // The recorder node produces no audible output of its own (see that
      // file) — route it through a zero-gain node into the destination so
      // the graph keeps pulling/processing it without any mic monitoring.
      const silentGain = recordingCtx.createGain();
      silentGain.gain.value = 0;
      micSource.connect(recorderNode);
      recorderNode.connect(silentGain);
      silentGain.connect(recordingCtx.destination);
      recordingCtxRef.current = recordingCtx;
      recorderNodeRef.current = recorderNode;

      const playbackCtx = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
      await playbackCtx.audioWorklet.addModule(new URL('../lib/audio/pcm-player-worklet.ts', import.meta.url).href);
      const playerNode = new AudioWorkletNode(playbackCtx, 'pcm-player-worklet', { outputChannelCount: [1] });
      playerNode.port.onmessage = (event: MessageEvent) => {
        if (event.data?.type === 'playback-state') {
          setStatus((prev) => (prev === 'error' ? prev : event.data.playing ? 'speaking' : 'listening'));
        }
      };
      playerNode.connect(playbackCtx.destination);
      playbackCtxRef.current = playbackCtx;
      playerNodeRef.current = playerNode;

      if (stoppedRef.current) return;
      await connect();
    } catch (err) {
      stoppedRef.current = true;
      teardownAudio();
      const { message, moduleDisabled: disabled } = describeError(err);
      setStatus('error');
      setError(message);
      setModuleDisabled(disabled);
    }
  }, [connect, teardownAudio]);

  return { status, error, moduleDisabled, transcript, start, stop };
}
