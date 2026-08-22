/**
 * Base64 <-> ArrayBuffer conversion for streaming raw PCM audio to/from
 * Gemini Live, which expects/returns audio as base64-encoded bytes inside
 * JSON WebSocket messages (see `useVoiceSession.ts`). Main-thread only —
 * the AudioWorklet processors (`pcm-*-worklet.ts`) exchange raw
 * ArrayBuffers over `port.postMessage` instead, so they never need this.
 */

// String.fromCharCode(...bytes) blows the call stack on a large typed
// array passed as one spread argument — encode in bounded chunks instead.
const ENCODE_CHUNK_SIZE = 8192;

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += ENCODE_CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + ENCODE_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
