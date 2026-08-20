/**
 * Exponential backoff + full jitter retry helper — for idempotent
 * operations only (GET/list/query-style calls). Never wrap a
 * non-idempotent call (POST that creates a record, webhook delivery,
 * etc.) with this, since a retried request could then duplicate
 * side effects.
 */
export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  /** Optional predicate to decide whether a given error is worth retrying (defaults to "always retry"). */
  isRetryable?: (err: unknown) => boolean;
}

export async function retryIdempotent<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retryable = options.isRetryable ? options.isRetryable(err) : true;
      if (!retryable || attempt === options.maxAttempts) {
        throw err;
      }
      const exponential = options.baseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.random() * exponential;
      await new Promise((resolve) => setTimeout(resolve, exponential / 2 + jitter));
    }
  }
  throw lastError;
}
