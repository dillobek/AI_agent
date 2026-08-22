/**
 * Minimal ambient declarations for the AudioWorkletGlobalScope.
 *
 * TypeScript's bundled DOM lib does not include these — AudioWorklet
 * processors run in a separate global scope from the main thread/window,
 * so they're not part of `lib.dom.d.ts`. Rather than add `@types/audioworklet`
 * as a dependency for a handful of declarations, only what
 * `pcm-recorder-worklet.ts` / `pcm-player-worklet.ts` actually use is
 * declared here. This file is picked up automatically by `tsconfig.json`'s
 * `include: ["src"]` — no per-file `/// <reference>` needed.
 */
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: unknown) => AudioWorkletProcessor,
): void;
