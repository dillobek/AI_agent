/**
 * Runs inside the AudioWorkletGlobalScope, mirroring `pcm-recorder-worklet.ts`
 * (self-contained, no shared imports — see that file's doc comment for why).
 *
 * Receives 16-bit PCM chunks (ArrayBuffers) from the main thread via
 * `port.onmessage` — one message per audio chunk Gemini Live streamed
 * back — queues them, and drains the queue sample-by-sample as `process()`
 * is pulled by the audio graph. The AudioContext driving this node MUST be
 * created with `{ sampleRate: 24000 }` — Gemini Live's audio output is raw
 * 16-bit PCM at exactly 24kHz, little-endian.
 *
 * A `{ type: 'clear' }` message empties the queue immediately — this is
 * how barge-in works: the moment Gemini Live reports
 * `serverContent.interrupted`, the main thread posts `clear` and playback
 * stops within one render quantum instead of finishing whatever audio was
 * already queued.
 *
 * Also posts `{ type: 'playback-state', playing }` back to the main
 * thread whenever playback starts/stops, so the UI's "speaking" indicator
 * reflects actual audio output rather than just "a message arrived" — but
 * only on state *transitions*, not every render quantum, to avoid
 * flooding postMessage.
 */
class PcmPlayerProcessor extends AudioWorkletProcessor {
  private queue: Float32Array[] = [];
  private readOffset = 0;
  private wasPlaying = false;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | ArrayBuffer;
      if (data && typeof data === 'object' && !(data instanceof ArrayBuffer) && data.type === 'clear') {
        this.queue = [];
        this.readOffset = 0;
        return;
      }

      const int16 = new Int16Array(event.data as ArrayBuffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        const s = int16[i];
        float32[i] = s < 0 ? s / 0x8000 : s / 0x7fff;
      }
      this.queue.push(float32);
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    if (!output || !output[0]) return true;

    let written = 0;
    while (written < output[0].length && this.queue.length > 0) {
      const current = this.queue[0];
      const available = current.length - this.readOffset;
      const toCopy = Math.min(available, output[0].length - written);
      output[0].set(current.subarray(this.readOffset, this.readOffset + toCopy), written);
      written += toCopy;
      this.readOffset += toCopy;
      if (this.readOffset >= current.length) {
        this.queue.shift();
        this.readOffset = 0;
      }
    }

    // Duplicate the mono output to any additional channels rather than
    // leaving them silent (which would sound hard-panned to one side).
    for (let ch = 1; ch < output.length; ch++) {
      output[ch].set(output[0]);
    }

    const isPlaying = written > 0;
    if (isPlaying !== this.wasPlaying) {
      this.wasPlaying = isPlaying;
      this.port.postMessage({ type: 'playback-state', playing: isPlaying });
    }
    return true;
  }
}

registerProcessor('pcm-player-worklet', PcmPlayerProcessor);
