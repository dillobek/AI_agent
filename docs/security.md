# Security details

This document goes deeper than [SECURITY.md](../SECURITY.md)'s summary. It describes the
actual mechanisms enforced in code, so a reviewer can verify the claims against the source.

## Configuration validation (`src/config/env.schema.ts`)

- Every environment variable is parsed through a `zod` schema at startup; an invalid or
  incomplete environment throws before the app finishes bootstrapping.
- In `NODE_ENV=production`: `JWT_SECRET`, `FINANCE_WEBHOOK_SECRET`, and `N8N_INBOUND_SECRET`
  (when their module is enabled) are rejected if they match a known placeholder value
  (`change_me`, `secret`, `password`, `admin`, empty string, etc.) or are under 32 characters.
  `DASHBOARD_CORS_ORIGIN` cannot be `*`, and `OBSIDIAN_ALLOW_INSECURE_TLS` cannot be enabled.
- Each optional module's required fields are only enforced when that module's `*_ENABLED` flag
  is true — so you're never forced to configure credentials for something you don't use, but
  you also can't silently half-enable something.

## Authentication & session security

- Passwords are hashed with `bcrypt` at cost factor 12 (`src/auth/auth.service.ts`).
- The first user is created via `POST /auth/register-admin`, which checks `user.count() === 0`
  and refuses (`403`) once any account exists — there is no permanent shared secret.
- Failed logins are counted per identifier via `LoginAttempt`; after `LOGIN_MAX_ATTEMPTS`
  failures within the lockout window, further attempts are rejected regardless of password
  correctness (`LOGIN_LOCKOUT_MINUTES`).
- JWTs embed a `jti`. `POST /auth/logout` writes that `jti` to `RevokedToken`; `JwtStrategy`
  checks `RevokedToken` **and** `user.isActive` on every single authenticated request — a
  revoked or deactivated account is locked out immediately, not just until token expiry.
- Route-level RBAC via `@Roles(Role.ADMIN)` / `@Roles(Role.ADMIN, Role.USER)` + `RolesGuard`.

## Webhook authenticity (Finance)

`POST /finance/webhook/receipt` (`src/finance/finance-webhook.guard.ts`):

1. `main.ts` captures the exact raw request bytes via `express.json({ verify })` before any
   DTO transformation happens, so the signature is verified over precisely what was received.
2. The guard fails closed: if `FINANCE_WEBHOOK_SECRET` is not configured, every request is
   rejected — there is no "unsigned mode."
3. Expects `x-finance-signature` and `x-finance-timestamp` headers. Computes
   `HMAC-SHA256(secret, "${timestamp}.${rawBody}")` and compares it to the provided signature
   using `crypto.timingSafeEqual` (constant-time, avoids timing side-channels).
4. Rejects requests whose timestamp falls outside `FINANCE_WEBHOOK_REPLAY_WINDOW_SECONDS` of
   the current time.
5. Enforces single-use via a real database unique constraint: `WebhookEvent.signature @unique`.
   The guard attempts to insert the signature; a unique-constraint violation means this exact
   signed request was already processed, and the request is rejected as a replay. This survives
   process restarts, unlike an in-memory de-dup set.

## n8n inbound trigger

`POST /n8n/trigger` requires header `x-n8n-secret` matching `N8N_INBOUND_SECRET` (constant-time
comparison). The `action` field is restricted to a closed whitelist
(`agent_prompt`/`finance_summary`/`patient_history`) validated by a DTO — there is no code path
from this endpoint to shell execution, file access, or arbitrary method invocation.

## AI agent safety

- **Bounded execution.** `AGENT_MAX_TOOL_CALLS` hard-caps the tool-calling loop;
  `AGENT_TOOL_TIMEOUT_MS` bounds each individual tool call via `Promise.race`.
- **Strict argument validation.** Every tool has a `zod` `.strict()` schema
  (`src/ai/tools/agent-tools.service.ts`) — unknown fields, wrong types, and malformed dates
  are all rejected before the tool's underlying service method ever runs.
- **Defense in depth on module gating.** Tools for disabled modules are both (a) never
  advertised to the model (`getAvailableDeclarations()` filters by `moduleFlags`) and (b)
  rejected again inside `execute()` if somehow called anyway.
- **System prompt guardrails** (`src/ai/system-prompt.ts`): explicit instructions not to give
  medical diagnoses, treatment plans, or financial/legal advice, and to defer to a human
  professional. Retrieved/external content is wrapped with `wrapUntrustedContent()` and
  labeled as data, not instructions, to reduce prompt-injection risk.
- **No raw errors reach the model or user.** `executeToolSafely` catches every failure mode
  and converts it to a short, generic message before it's ever included in a prompt or
  response.

## Privacy & logging

- `src/common/utils/redaction.util.ts` redacts values under sensitive-looking keys (tokens,
  passwords, secrets, phone numbers, etc.) and truncates long strings before anything is
  persisted to `ExecutionLog`.
- `AuditLogService` records a separate, payload-free trail (actor, action, resource, outcome,
  timestamp) — auditable without doubling as a place sensitive data leaks into.
- `CleanupService` runs an hourly job purging `ExecutionLog` rows older than
  `LOG_RETENTION_DAYS` and expired `RevokedToken`/`ConversationSession` rows.

## Network-facing hardening

- `helmet()` security headers on every response.
- Global rate limiting (`@nestjs/throttler`), tunable via `RATE_LIMIT_TTL_SECONDS`/`RATE_LIMIT_MAX`,
  with a stricter override on `/auth/login`.
- `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` globally —
  unexpected fields in any request body are rejected, not silently dropped or passed through.
- `AllExceptionsFilter` returns generic messages for 5xx errors in production (no stack traces
  or internal paths), while always including a request ID for support/correlation.
- Swagger (`/api/docs`) is only mounted outside `NODE_ENV=production`.
- Obsidian vault paths are checked against directory traversal (`assertSafeVaultPath`); TLS
  verification defaults on and can only be disabled outside production; requests have a
  bounded timeout.
- Google Drive pagination is capped (`maxPages`) to prevent unbounded iteration on a
  huge/misconfigured Drive; retryable errors (429/5xx) use exponential backoff with jitter.

## Known limitation of this delivery

Dependency installation and test execution could not be run in the environment this project
was hardened in (no npm registry access). Every test was written against mocks and is ready to
run; run `npm install && npm test && npm run test:e2e && npm run build` yourself and treat that
as the authoritative check, along with `npm audit` for the dependency tree.
