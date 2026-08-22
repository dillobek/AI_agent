/**
 * Server-local start/end-of-day ISO boundaries for "today". This follows
 * the same convention as every other date field in this app (Transaction.date,
 * PlanItem.scheduledFor, etc.) — there is no separate timezone-handling layer
 * anywhere in the codebase; if a deployment needs a specific zone's day
 * boundary (e.g. Asia/Tashkent), set the process's `TZ` environment variable,
 * the standard Node/Docker mechanism, rather than adding bespoke handling here.
 */
export function todayRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}
