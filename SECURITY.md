# Security Policy

## Reporting a vulnerability

If you find a security issue in this project, please report it privately rather than opening
a public GitHub issue. Open a private security advisory on the repository (GitHub: Security →
Advisories → "Report a vulnerability"), or contact the maintainer listed in the repository
directly. Please include:

- A description of the issue and its impact
- Steps to reproduce (or a proof-of-concept)
- The affected version/commit

We aim to acknowledge reports within a few days. Please do not test against production
instances you do not own or have explicit permission to test.

## Supported versions

This is a single-branch project; only the latest commit on the default branch is supported.
Apply updates by pulling and re-running migrations/build.

## Design-level security measures

This is a summary; see [docs/security.md](docs/security.md) for full detail.

- **No hardcoded secrets or personal data.** Every credential, phone number, name, and API key
  is supplied via `.env` (validated by `src/config/env.schema.ts`) or stored in the database —
  never in source.
- **Production guardrails on configuration.** In `NODE_ENV=production`, the app refuses to
  boot with default/placeholder secrets, a wildcard CORS origin, or insecure-TLS overrides.
- **Fail-closed module gating.** Every optional module (Telegram, Drive, Obsidian, RAG, n8n)
  is off unless explicitly enabled, and a disabled module's routes return `503` rather than
  attempting to run with missing configuration.
- **Webhook authenticity.** The Finance receipt webhook and n8n inbound trigger both verify a
  constant-time HMAC/secret comparison; the Finance webhook additionally has replay protection
  via a timestamp window and a database-enforced idempotency key.
- **Auth.** Bcrypt-hashed passwords (cost 12), JWT with revocable `jti`, login lockout after
  repeated failures, and role-based access control on every sensitive route.
- **Bounded AI agent.** The tool-calling loop has a hard step limit, per-call timeouts, strict
  schema validation of every tool argument, and a system prompt that explicitly refuses
  medical/financial/legal advice and treats retrieved content as untrusted.
- **Privacy-by-design logging.** Logs are redacted before persistence (see
  `src/common/utils/redaction.util.ts`); a separate, payload-free `AuditLog` records
  who-did-what without storing sensitive request bodies; both have a retention policy.
- **API-level hardening.** `helmet` security headers, global rate limiting
  (`@nestjs/throttler`), strict input validation (`forbidNonWhitelisted`), sanitized error
  responses in production (no stack traces or internal details leaked), and Swagger docs
  disabled outside development.
- **Path/network safety.** Obsidian vault paths are checked against directory traversal;
  outbound HTTP calls use TLS verification by default and bounded timeouts; Google Drive
  pagination is capped to prevent unbounded iteration.

## Reviewed for backdoors / covert behavior

Every file in this codebase was authored for this project. Before delivery the full source
tree was reviewed for: dynamic code execution (`eval`, `new Function`, `child_process`),
unexpected raw network primitives outside the documented client libraries, input-capture
patterns (keylogging, clipboard hooks), obfuscated/encoded payloads, and undocumented
`process.env` reads. None were found. All outbound network calls go to services *you*
configure via `.env` — there is no hardcoded third-party endpoint anywhere in the source.
This review could not include `npm install`'s transitive dependency tree (no registry access
in the review environment) — run `npm audit` yourself before deploying.
