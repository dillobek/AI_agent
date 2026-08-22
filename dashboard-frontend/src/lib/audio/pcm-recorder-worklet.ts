/**
 * Runs inside the AudioWorkletGlobalScope (loaded via
 * `audioContext.audioWorklet.addModule(...)`, see `useVoiceSession.ts`) —
 * a separate global scope from the main thread, with no access to
 * `window`, the DOM, or the rest of the app's module graph. Deliberately
 * self-contained (no imports from elsewhere in the app) rather than
 * sharing a "PCM conversion" helper with the main thread, since anything
 * imported here would need to be worklet-scope-safe too.
 *
 * The AudioContext driving this node MUST be created with
 * `{ sampleRate: 16000 }` — Gemini Live expects raw 16-bit PCM at exactly
 * 16kHz, little-endian, and the browser transparently resamples the
 * microphone's native-rate input into the context's configured rate as
 * part of the Web Audio pipeline, so this processor never resamples by
 * hand.
 *
 * Batches samples into ~100ms chunks (1600 frames at 16kHz) before
 * posting to the main thread, rather than every 128-sample render
 * quantum, to keep message-passing overhead reasonable without adding
 * noticeable latency to a real-time conversation.
 */
const CHUNK_SIZE = 1600; // ~100ms at 16kHz

class PcmRecorderProcessor extends AudioWorkletProcessor {
  private chunk = new Int16Array(CHUNK_SIZE);
  private offset = 0;

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        // Clamp to [-1, 1] first — a hot input signal can exceed that
        // range and wrap instead of clip if scaled unclamped.
        const sample = Math.max(-1, Math.min(1, channel[i]));
        this.chunk[this.offset++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;

        if (this.offset === CHUNK_SIZE) {
          // .slice() copies into a fresh ArrayBuffer so the transfer below
          // doesn't detach the buffer this.chunk itself keeps writing into.
          const copy = this.chunk.slice();
          this.port.postMessage(copy.buffer, [copy.buffer]);
          this.offset = 0;
        }
      }
    }
    return true; // keep this node alive for the life of the session
  }
}

registerProcessor('pcm-recorder-worklet', PcmRecorderProcessor);
