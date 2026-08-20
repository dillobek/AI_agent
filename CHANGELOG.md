# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] — Production hardening pass

### Added
- Centralized, `zod`-validated environment configuration (`src/config/`) with production
  guardrails against default/placeholder secrets, wildcard CORS, and insecure TLS overrides.
- Interactive `npm run setup` onboarding wizard (`scripts/setup.js`) that generates a working
  `.env`, auto-generating strong secrets and only asking for credentials of modules you enable.
- Fail-closed optional-module gating (`@RequireModule` + `ModuleEnabledGuard`) across Telegram,
  Google Drive, Obsidian, RAG, n8n, Finance, Patients, and Dashboard.
- Full JWT auth + RBAC overhaul: bootstrap-only first-admin registration, bcrypt password
  hashing, login lockout, revocable tokens (`jti` + `RevokedToken`), `@Roles`/`RolesGuard`.
- Bounded, multi-step AI agent tool-calling loop with per-call timeouts, strict `zod`
  validation of every tool argument, and a safety-focused system prompt.
- Real RAG implementation: real Gemini embeddings, deterministic chunk IDs, content-hash-based
  skip-if-unchanged, honest indexed/skipped/failed reporting.
- Hardened Finance webhook: raw-body HMAC-SHA256 verification, replay-window protection, and a
  database-enforced idempotency key (`WebhookEvent.signature @unique`).
- Hardened Google Drive and Obsidian integrations: lazy client init, TLS verification by
  default, path-traversal guards, pagination caps, retry with exponential backoff + jitter.
- Privacy-by-design logging: structured redaction before persistence, a separate payload-free
  `AuditLog`, and scheduled retention cleanup (`CleanupService`).
- API-level hardening: `helmet`, global rate limiting, sanitized production error responses,
  request-ID correlation, Swagger gated to non-production.
- Prisma schema hardening: `Decimal` money fields, new `RevokedToken`/`LoginAttempt`/
  `WebhookEvent`/`AuditLog`/`ConversationSession` models, added indexes and unique constraints.
- Adapter-based AI provider architecture (`src/ai/adapters/`) decoupling the agent loop from
  the Gemini SDK specifically.
- Frontend hardening: a module status page, loading/empty/error states, sessionStorage-based
  token handling, locale-aware number/date formatting.
- Docker/distribution hardening: `npm ci`, pinned base images, non-root containers,
  healthchecks, localhost-only database/vector-store ports, separate dev/prod compose files,
  automatic `prisma migrate deploy` on container startup.
- Unit tests for the agent loop, tool argument validation, webhook HMAC/replay logic, patient
  search edge cases, config validation, and log redaction; an e2e suite covering health,
  auth, RBAC, module gating, and the finance webhook flow end-to-end against an in-memory
  Prisma fake (no live database required).
- `SECURITY.md`, `CONTRIBUTING.md`, `LICENSE` (MIT), and a `docs/` set (architecture,
  installation, security, troubleshooting).

### Changed
- `Transaction.amount` changed from `Float` to `Decimal(14,2)` to avoid floating-point money
  errors (**breaking**: requires a migration; see [docs/installation.md](docs/installation.md)).
- Dashboard/API auth removed the shared "access code" model entirely in favor of per-user
  passwords and roles (**breaking**: existing deployments must re-bootstrap via
  `POST /auth/register-admin`).
- `KnowledgeDocument` restructured to store `contentHash`/`chunkCount` instead of raw content.

### Fixed
- `test/jest-e2e.json` was missing, which would have made `npm run test:e2e` fail immediately —
  added.
- The original "disabled module" e2e assertion only proved that authentication is enforced,
  not that the module gate itself returns `503` — corrected to assert the actual guard
  behavior, including the authenticated-but-disabled case.

## Earlier history

- Initial NestJS scaffold: Telegram bot, dashboard, Drive/Obsidian integration, RAG,
  Gemini agent, medical CRM, finance engine.
- n8n integration added, with an initial security review confirming no backdoor/keylogger
  patterns in the source tree.
