/**
 * Splits `text` into overlapping chunks of roughly `chunkSize` characters,
 * with `overlap` characters repeated between consecutive chunks so a
 * concept split across a chunk boundary still appears whole in at least
 * one chunk. Character-based (not token-based) — simple, dependency-free,
 * and good enough for the chunk sizes used here (see RAG_CHUNK_SIZE).
 */
export function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= chunkSize) return [trimmed];

  const safeOverlap = Math.min(overlap, Math.floor(chunkSize / 2));
  const chunks: string[] = [];
  let start = 0;

  while (start < trimmed.length) {
    const end = Math.min(start + chunkSize, trimmed.length);
    chunks.push(trimmed.slice(start, end));
    if (end === trimmed.length) break;
    start = end - safeOverlap;
  }

  return chunks;
}
