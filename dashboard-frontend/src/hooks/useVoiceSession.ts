import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

export type VoiceStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';
export interface VoiceTranscriptMessage { id: string; role: 'user' | 'agent'; text: string; at: number; }
let sequence = 0;
const id = () => `voice-${++sequence}`;

function failure(error: unknown) {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 503) return 'Voice moduli serverda yoqilmagan.';
  if (error instanceof DOMException && error.name === 'NotAllowedError') return 'Mikrofon ruxsati berilmadi.';
  if (error instanceof DOMException && error.name === 'NotFoundError') return 'Mikrofon topilmadi.';
  if (error instanceof DOMException && error.name === 'NotReadableError') return 'Mikrofon boshqa dastur tomonidan band.';
  return error instanceof Error ? error.message : 'Voice ulanishi ishga tushmadi.';
}

/** OpenAI Realtime WebRTC: browser audio is sent directly, without AudioWorklets. */
export function useVoiceSession() {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [moduleDisabled, setModuleDisabled] = useState(false);
  const [transcript, setTranscript] = useState<VoiceTranscriptMessage[]>([]);
  const peer = useRef<RTCPeerConnection | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const stopped = useRef(true);

  const stop = useCallback(() => {
    stopped.current = true;
    peer.current?.close(); peer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null;
    setStatus('idle');
  }, []);
  useEffect(() => () => stop(), [stop]);

  const start = useCallback(async () => {
    if (!stopped.current) return;
    stopped.current = false; setStatus('connecting'); setError(null); setModuleDisabled(false); setTranscript([]);
    try {
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.current = microphone;
      const connection = new RTCPeerConnection(); peer.current = connection;
      const speaker = new Audio(); speaker.autoplay = true;
      connection.ontrack = (event) => { speaker.srcObject = event.streams[0]; void speaker.play().catch(() => {}); setStatus('speaking'); };
      connection.onconnectionstatechange = () => { if (!stopped.current && ['failed', 'disconnected', 'closed'].includes(connection.connectionState)) { setStatus('error'); setError('OpenAI Realtime ulanishi uzildi.'); } };
      microphone.getTracks().forEach((track) => connection.addTrack(track, microphone));
      const channel = connection.createDataChannel('oai-events');
      channel.onmessage = ({ data }) => { try { const event = JSON.parse(data) as { type?: string; transcript?: string }; if (event.transcript && event.type === 'conversation.item.input_audio_transcription.completed') setTranscript((rows) => [...rows, { id: id(), role: 'user', text: event.transcript!, at: Date.now() }]); if (event.transcript && event.type === 'response.output_audio_transcript.done') setTranscript((rows) => [...rows, { id: id(), role: 'agent', text: event.transcript!, at: Date.now() }]); if (event.type === 'response.done') setStatus('listening'); } catch { /* Ignore non-JSON events. */ } };
      const offer = await connection.createOffer(); await connection.setLocalDescription(offer);
      const { data } = await api.post<{ answerSdp: string }>('/voice/realtime-call', { offerSdp: offer.sdp });
      if (stopped.current) return;
      await connection.setRemoteDescription({ type: 'answer', sdp: data.answerSdp }); setStatus('listening');
    } catch (cause) {
      const disabled = (cause as { response?: { status?: number } })?.response?.status === 503;
      stop(); setError(failure(cause)); setModuleDisabled(disabled); setStatus('error');
    }
  }, [stop]);
  return { status, error, moduleDisabled, transcript, start, stop };
}
