/**
 * Anti-rate-limit helper (NFR #2).
 * Awaits a randomized delay (default 1000ms - 2000ms) before firing
 * outbound Telegram/Meta/Google API calls, to avoid platform rate limits
 * and account flags.
 */
export function delay(ms?: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function randomizedDelay(minMs = 1000, maxMs = 2000): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await delay(ms);
}
