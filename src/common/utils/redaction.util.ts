/**
 * Privacy-by-design log redaction (see docs/security.md).
 *
 * Used before anything derived from a prompt, tool call, or webhook payload
 * is written to ExecutionLog, console output, or an error response. Two
 * concerns are handled:
 *  1. Known-sensitive field names (diagnosis, phone, medications, prompt,
 *     password, secret, token, key, ...) are masked regardless of value.
 *  2. Everything else is size-capped so a single oversized field can't blow
 *     up log storage or leak an entire document into a debug log.
 */

const SENSITIVE_KEY_PATTERN =
  /(password|secret|token|apikey|api_key|credential|diagnosis|prescription|medication|phone|prompt|ssn|passport)/i;

const MAX_STRING_LENGTH = 500;

function maskString(value: string): string {
  if (value.length <= 8) return '***';
  return `${value.slice(0, 3)}***${value.slice(-2)} (redacted, ${value.length} chars)`;
}

function truncate(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}… (truncated, ${value.length} chars total)`;
}

/** Deep-redacts an object for safe logging. Never throws — falls back to a placeholder on cycles/errors. */
export function redactForLog(input: unknown, depth = 0): unknown {
  if (depth > 6) return '[max-depth]';
  if (input === null || input === undefined) return input;

  if (typeof input === 'string') return truncate(input);
  if (typeof input === 'number' || typeof input === 'boolean') return input;

  if (Array.isArray(input)) {
    return input.slice(0, 50).map((item) => redactForLog(item, depth + 1));
  }

  if (typeof input === 'object') {
    try {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
          out[key] = typeof value === 'string' ? maskString(value) : '***redacted***';
        } else {
          out[key] = redactForLog(value, depth + 1);
        }
      }
      return out;
    } catch {
      return '[unserializable]';
    }
  }

  return String(input);
}

/** Masks a bare secret string for inclusion in a log line (e.g. "sk-***89"). */
export function maskSecret(value: string | undefined | null): string {
  if (!value) return '(unset)';
  return maskString(value);
}
