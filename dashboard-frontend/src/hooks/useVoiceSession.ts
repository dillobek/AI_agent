import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

export type VoiceStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

export interface VoiceTranscriptMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  at: number;
}

/** The events we act on, out of the much larger set OpenAI Realtime emits on the data channel. */
interface RealtimeEvent {
  type?: string;
  /** `response.function_call_arguments.done` */
  name?: string;
  call_id?: string;
  arguments?: string;
  /** transcription events */
  transcript?: string;
  /** `error` */
  error?: { message?: string; code?: string };
}

let sequence = 0;
const nextId = () => `voice-${++sequence}`;

/**
 * Turns any failure into one sentence the user can act on. Errors reach
 * this hook from three different places — the browser's mic permissions,
 * our own API, and OpenAI — so the message has to say which, or the UI
 * ends up showing "Request failed with status code 500" and nothing else.
 */
function describeFailure(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Mikrofon ruxsati berilmadi.';
    if (error.name === 'NotFoundError') return 'Mikrofon topilmadi.';
    if (error.name === 'NotReadableError') return 'Mikrofon boshqa dastur tomonidan band.';
  }

  const response = (error as { response?: { status?: number; data?: { message?: unknown } } })?.response;
  if (response) {
    if (response.status === 402) {
      return "OpenAI balans tugagan. Jarvisdan foydalanish uchun Billing bo'limida API kreditini to'ldiring.";
    }
    // The API's own message is the useful half — VoiceService now returns a
    // distinct one for a missing key, an unreachable OpenAI, and a session
    // OpenAI rejected. Nest sends `message` as a string, or as an array of
    // strings for a DTO validation failure.
    const detail = Array.isArray(response.data?.message)
      ? (response.data?.message as unknown[]).join('; ')
      : response.data?.message;
    if (typeof detail === 'string' && /insufficient_quota|insufficient quota|billing/i.test(detail)) {
      return "OpenAI balans tugagan. Jarvisdan foydalanish uchun Billing bo'limida API kreditini to'ldiring.";
    }
    if (typeof detail === 'string' && detail) return detail;
    if (response.status === 503) return 'Voice moduli serverda yoqilmagan.';
    return `Server xatosi (HTTP ${response.status ?? '?'}).`;
  }

  return error instanceof Error ? error.message : 'Voice ulanishi ishga tushmadi.';
}

/**
 * One real-time voice conversation with "Ali", over a WebRTC peer
 * connection straight to OpenAI Realtime. Audio never touches our server —
 * but the model's *decisions* do:
 *
 *   mic ──WebRTC──▶ OpenAI ──data channel──▶ this hook
 *                                              │ function call
 *                                              ▼
 *                                    POST /voice/execute-tool  (our JWT)
 *                                              │ result
 *                                              ▼
 *                              conversation.item.create + response.create
 *
 * That relay is what makes the assistant able to *do* anything rather than
 * only talk: the browser holds no Drive/Finance/DB credentials, so every
 * tool the model picks is executed server-side as the signed-in user.
 */
export function useVoiceSession() {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [moduleDisabled, setModuleDisabled] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [transcript, setTranscript] = useState<VoiceTranscriptMessage[]>([]);

  const peer = useRef<RTCPeerConnection | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioElement = useRef<HTMLAudioElement | null>(null);
  // True whenever the user hasn't asked to be connected — guards every
  // async callback from acting after stop() has already torn things down.
  const stopped = useRef(true);

  const pushTranscript = useCallback((role: 'user' | 'agent', text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTranscript((rows) => [...rows, { id: nextId(), role, text: trimmed, at: Date.now() }]);
  }, []);

  const stop = useCallback(() => {
    stopped.current = true;
    channel.current?.close();
    channel.current = null;
    peer.current?.close();
    peer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (audioElement.current) {
      audioElement.current.srcObject = null;
      audioElement.current = null;
    }
    setStatus('idle');
  }, []);

  // Leaving a live microphone running after the user navigates away is a
  // privacy problem, not just a resource leak.
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => () => stopRef.current(), []);

  const send = useCallback((event: Record<string, unknown>) => {
    const dataChannel = channel.current;
    if (!dataChannel || dataChannel.readyState !== 'open') return;
    dataChannel.send(JSON.stringify(event));
  }, []);

  /**
   * Runs one tool the model asked for and hands the result back, then asks
   * for a new response so it speaks the answer.
   *
   * A failure here is reported to the model as text rather than thrown: the
   * conversation is live, and an assistant that goes silent is worse than
   * one that says it couldn't reach a tool.
   */
  const runToolCall = useCallback(
    async (event: RealtimeEvent) => {
      const callId = event.call_id;
      const toolName = event.name;
      if (!callId || !toolName) return;

      let output: string;
      try {
        const args = event.arguments ? (JSON.parse(event.arguments) as Record<string, unknown>) : {};
        const { data } = await api.post<{ callId: string; result: string }>('/voice/execute-tool', {
          toolName,
          args,
          callId,
        });
        output = data.result;
      } catch (cause) {
        output = `Tool "${toolName}" ishlamadi: ${describeFailure(cause)}`;
      }

      if (stopped.current) return;
      send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output } });
      send({ type: 'response.create' });
    },
    [send],
  );

  const handleEvent = useCallback(
    (raw: string) => {
      let event: RealtimeEvent;
      try {
        event = JSON.parse(raw) as RealtimeEvent;
      } catch {
        return; // Non-JSON keepalive or partial frame — nothing to act on.
      }

      switch (event.type) {
        case 'response.function_call_arguments.done':
          void runToolCall(event);
          break;

        // The user's own words, transcribed by the model configured in
        // `audio.input.transcription` server-side. Without that config this
        // event never fires and only the assistant's half is ever shown.
        case 'conversation.item.input_audio_transcription.completed':
          if (event.transcript) pushTranscript('user', event.transcript);
          break;

        case 'response.output_audio_transcript.done':
          if (event.transcript) pushTranscript('agent', event.transcript);
          break;

        // Audio actually leaving the speaker is a truer "speaking" signal
        // than "a response started", which is also true while the model is
        // silently deciding to call a tool.
        case 'output_audio_buffer.started':
          setStatus((prev) => (prev === 'error' ? prev : 'speaking'));
          break;

        case 'output_audio_buffer.stopped':
        case 'output_audio_buffer.cleared':
        case 'response.done':
          setStatus((prev) => (prev === 'error' ? prev : 'listening'));
          break;

        case 'error':
          setStatus('error');
          setError(event.error?.message ?? 'OpenAI Realtime xatosi.');
          break;

        default:
          break;
      }
    },
    [pushTranscript, runToolCall],
  );

  const start = useCallback(async () => {
    if (!stopped.current) return;
    stopped.current = false;
    setStatus('connecting');
    setError(null);
    setModuleDisabled(false);
    setMicDenied(false);
    setTranscript([]);

    try {
      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (stopped.current) {
        microphone.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = microphone;

      const connection = new RTCPeerConnection();
      peer.current = connection;

      const speaker = new Audio();
      speaker.autoplay = true;
      audioElement.current = speaker;
      connection.ontrack = (event) => {
        speaker.srcObject = event.streams[0];
        void speaker.play().catch(() => {
          /* Autoplay can be blocked until the user interacts; the track is still attached. */
        });
      };

      connection.onconnectionstatechange = () => {
        if (stopped.current) return;
        if (['failed', 'disconnected', 'closed'].includes(connection.connectionState)) {
          setStatus('error');
          setError('OpenAI Realtime ulanishi uzildi.');
        }
      };

      microphone.getTracks().forEach((track) => connection.addTrack(track, microphone));

      // Created before createOffer so the data channel is negotiated in the
      // same SDP — this is the channel every tool call arrives on.
      const dataChannel = connection.createDataChannel('oai-events');
      channel.current = dataChannel;
      dataChannel.onmessage = (event: MessageEvent<string>) => {
        if (!stopped.current) handleEvent(event.data);
      };

      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);

      const { data } = await api.post<{ answerSdp: string }>('/voice/realtime-call', { offerSdp: offer.sdp });
      if (stopped.current) return;

      await connection.setRemoteDescription({ type: 'answer', sdp: data.answerSdp });
      setStatus('listening');
    } catch (cause) {
      const httpStatus = (cause as { response?: { status?: number } })?.response?.status;
      const denied = cause instanceof DOMException && cause.name === 'NotAllowedError';
      stop();
      setError(describeFailure(cause));
      setModuleDisabled(httpStatus === 503);
      setMicDenied(denied);
      setStatus('error');
    }
  }, [handleEvent, stop]);

  return { status, error, moduleDisabled, micDenied, transcript, start, stop };
}
