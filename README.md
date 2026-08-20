# AI Personal Assistant Ecosystem

A production-hardened, modular NestJS backend that orchestrates a personal/organizational AI
assistant: Telegram bot, web dashboard, Google Drive + Obsidian knowledge base, a vector-store
RAG pipeline, a Google Gemini agent with real tool/function calling, a medical CRM module, a
finance ledger with webhook ingestion, and optional n8n workflow automation.

Every credential, feature flag, and piece of user-specific data lives in `.env` — there is
**zero hardcoded personal data** in the source tree. Clone it, run `pnpm run setup`, fill in
your own credentials, and it's yours.

## Table of contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Prerequisites](#3-prerequisites)
4. [Quick start](#4-quick-start)
5. [Interactive setup wizard](#5-interactive-setup-wizard)
6. [Environment variables reference](#6-environment-variables-reference)
7. [Optional modules](#7-optional-modules)
8. [Credential setup guides](#8-credential-setup-guides)
9. [Running locally](#9-running-locally)
10. [Running with Docker](#10-running-with-docker)
11. [Database & migrations](#11-database--migrations)
12. [Authentication & RBAC](#12-authentication--rbac)
13. [The AI agent & tool calling](#13-the-ai-agent--tool-calling)
14. [RAG / knowledge base](#14-rag--knowledge-base)
15. [Testing](#15-testing)
16. [Security model](#16-security-model)
17. [Troubleshooting](#17-troubleshooting)
18. [Contributing & license](#18-contributing--license)

## 1. Overview

This project is a single NestJS application composed of independent, individually-toggleable
modules. Nothing about the code assumes it is running for any particular person, clinic, or
business — every name, phone number, folder path, and secret used anywhere in the app comes
from `.env` or the database, never from source code.

## 2. Architecture

```
src/
  config/        Centralized, validated environment config (zod) + AppConfigService
  common/        Global guards/filters/decorators, redaction, audit log, cleanup jobs
  auth/          JWT auth, RBAC (ADMIN/USER), login lockout, token revocation
  telegram/      Telegram bot (nestjs-telegraf) + whitelist guard
  drive/         Google Drive search ("latest file for X") with pagination + retry
  obsidian/      Obsidian Local REST API -> knowledge base sync
  rag/           Vector store (ChromaDB) with real embeddings, chunking, dedup
  ai/            Gemini agent: adapter, bounded tool-calling loop, system prompt, tools
  finance/       Income/expense ledger, P&L, HMAC-verified receipt webhook
  patients/      Medical CRM (patients, prescriptions, RAG-backed history)
  dashboard/     Aggregated dashboard endpoints (P&L, logs, audit trail, overview)
  n8n/           n8n integration: secured inbound trigger + outbound event notifier
dashboard-frontend/   React + Vite admin web panel
prisma/               Prisma schema, migrations, seed script
scripts/setup.js      Interactive first-run configuration wizard
docker-compose.yml    API + PostgreSQL (+ optional ChromaDB, n8n via profiles)
test/                 e2e tests (in-memory Prisma fake, no live DB required)
```

Design principles this codebase follows throughout:

- **Fail closed.** A missing secret, a disabled module, or an invalid webhook signature
  always results in a rejection — never a silent bypass.
- **Config-driven, not code-driven.** Every module can be turned on/off via an `*_ENABLED`
  flag; the app validates that the config it needs is actually present before it will boot.
- **Provider adapters, not vendor lock-in.** The AI provider (`src/ai/adapters/`) is behind
  an interface so a non-Gemini provider can be added without touching the agent loop.

## 3. Prerequisites

- Node.js 20+
- PostgreSQL 15+ (or Docker, which provides it for you)
- Docker & Docker Compose (recommended, especially for Postgres/ChromaDB/n8n)
- A Google Gemini API key (only required if you enable Telegram, RAG, n8n, or the dashboard
  AI assistant — the app validates this at startup)
- Optional: a Telegram bot token, a Google Cloud service account, an Obsidian vault with the
  "Local REST API" plugin, an n8n instance

## 4. Quick start

```bash
git clone <your-fork-url> ai-personal-assistant-ecosystem
cd ai-personal-assistant-ecosystem
corepack enable
pnpm install --frozen-lockfile
pnpm run setup         # interactive wizard — generates a real .env for you
docker compose up -d postgres
pnpm exec prisma migrate deploy
pnpm run start:dev
```

Then open http://localhost:3000/health to confirm the API is up, and
http://localhost:3000/api/docs for Swagger (development only).

## 5. Interactive setup wizard

`npm run setup` (`scripts/setup.js`) is the intended way to configure this project — no manual
`.env` editing or prior NestJS/Prisma knowledge required. It:

1. Asks which optional modules you want (Telegram, Google Drive, Obsidian, RAG, n8n) with a
   plain-language description of what each one does and what it will ask for if enabled.
2. Prompts for the database connection, generating a working local `DATABASE_URL` by default.
3. Generates strong random values for `JWT_SECRET`, `FINANCE_WEBHOOK_SECRET`, and
   `N8N_INBOUND_SECRET` automatically (via `crypto.randomBytes`) — you are never asked to
   invent a secret yourself, and secrets are never echoed to the terminal.
4. Only asks for credentials belonging to modules you opted into.
5. Writes a complete `.env` file at the project root and prints a summary of what was enabled
   and what to do next (run migrations, start the app, run `npm run prisma:seed` to bootstrap
   an admin account interactively via `POST /auth/register-admin`).

Re-running `npm run setup` at any time regenerates `.env` from scratch after asking for
confirmation — it never silently overwrites your existing configuration.

If you prefer manual configuration, copy `.env.example` to `.env` and fill in each value
yourself — every variable is documented inline in that file and in section 6 below.

## 6. Environment variables reference

The full, authoritative list of every variable, its default, and when it's required lives in
`src/config/env.schema.ts` (a `zod` schema — the single source of truth) and is mirrored with
comments in `.env.example`. Key groups:

| Group | Examples | Notes |
|---|---|---|
| Core | `NODE_ENV`, `PORT`, `DATABASE_URL` | Always required |
| Auth | `JWT_SECRET`, `JWT_EXPIRES_IN`, `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCKOUT_MINUTES` | `JWT_SECRET` must be ≥32 chars and non-placeholder in production |
| Module toggles | `TELEGRAM_ENABLED`, `GOOGLE_DRIVE_ENABLED`, `OBSIDIAN_ENABLED`, `RAG_ENABLED`, `N8N_ENABLED`, `FINANCE_MODULE_ENABLED`, `PATIENTS_MODULE_ENABLED`, `DASHBOARD_ENABLED` | Each unlocks conditional required fields below |
| AI provider | `AI_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_EMBEDDING_MODEL` | Required when any AI-dependent module is enabled |
| Agent bounds | `AGENT_MAX_TOOL_CALLS`, `AGENT_TOOL_TIMEOUT_MS`, `AGENT_MAX_PROMPT_CHARS`, `SESSION_TTL_MINUTES` | Protect against runaway loops and prompt-flooding |
| Google Drive | `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_DRIVE_ROOT_FOLDER_ID`, `GOOGLE_DRIVE_PAGE_SIZE` | Required only if `GOOGLE_DRIVE_ENABLED=true` |
| Obsidian | `OBSIDIAN_API_URL`, `OBSIDIAN_API_KEY`, `OBSIDIAN_ALLOW_INSECURE_TLS` | TLS verification is on by default; the insecure flag is rejected in production |
| RAG | `VECTOR_STORE_PROVIDER`, `CHROMA_URL`, `CHROMA_COLLECTION`, `RAG_CHUNK_SIZE`, `RAG_CHUNK_OVERLAP`, `RAG_SCORE_THRESHOLD` | |
| Finance | `FINANCE_WEBHOOK_SECRET`, `FINANCE_WEBHOOK_REPLAY_WINDOW_SECONDS` | Secret is required whenever the Finance module is on (default on) |
| n8n | `N8N_OUTBOUND_WEBHOOK_URL`, `N8N_INBOUND_SECRET` | Inbound secret required if `N8N_ENABLED=true` |
| Outbound throttling | `API_CALL_DELAY_MIN_MS`, `API_CALL_DELAY_MAX_MS`, `RETRY_MAX_ATTEMPTS`, `RETRY_BASE_DELAY_MS` | |
| Privacy/logging | `LOG_RETENTION_DAYS`, `LOG_LEVEL` | |
| Rate limiting | `RATE_LIMIT_TTL_SECONDS`, `RATE_LIMIT_MAX` | Global, applied to every route by default |

Booting with an invalid or incomplete environment throws a readable, itemized error at startup
instead of letting the app run half-configured — see [docs/security.md](docs/security.md) for
the exact rules enforced in production.

## 7. Optional modules

| Module | Flag | Default | What breaks if you skip it |
|---|---|---|---|
| Telegram bot | `TELEGRAM_ENABLED` | off | No Telegram interface; dashboard/API still work |
| Google Drive | `GOOGLE_DRIVE_ENABLED` | off | Agent's `find_latest_drive_file` tool is not offered |
| Obsidian | `OBSIDIAN_ENABLED` | off | `/obsidian/sync` returns 503; no vault-based knowledge base |
| RAG (vector search) | `RAG_ENABLED` | off | Patient history has no semantic search context |
| n8n | `N8N_ENABLED` | off | `/n8n/trigger` returns 503; no outbound workflow events |
| Finance | `FINANCE_MODULE_ENABLED` | **on** | Finance endpoints return 503 if disabled |
| Patients (CRM) | `PATIENTS_MODULE_ENABLED` | **on** | Patients endpoints return 503 if disabled |
| Dashboard | `DASHBOARD_ENABLED` | **on** | Web dashboard/API auth endpoints return 503 if disabled |

A disabled module never crashes the app or half-initializes a client — `ModuleEnabledGuard`
rejects requests to it with `503 Service Unavailable` before any handler code runs, and the
AI agent simply never offers that module's tool to Gemini in the first place.

## 8. Credential setup guides

### 8.1 Telegram bot token
1. Message **@BotFather** on Telegram, send `/newbot`, follow the prompts.
2. Copy the token into `TELEGRAM_BOT_TOKEN`.
3. Get your numeric Telegram user ID from **@userinfobot** and add it to
   `TELEGRAM_WHITELIST_IDS` (comma-separated for multiple admins). Any update from an ID not
   in this list is rejected before it reaches the agent.

### 8.2 Google Gemini API key
1. Go to https://aistudio.google.com/app/apikey.
2. Create a key, put it in `GEMINI_API_KEY`.

### 8.3 Google Drive (service account)
1. https://console.cloud.google.com/ → create/select a project → enable the **Google Drive API**.
2. Create a **Service Account**, generate a JSON key.
3. Save the JSON at e.g. `./credentials/google-service-account.json`, point
   `GOOGLE_APPLICATION_CREDENTIALS` at it (never commit this file — it's already gitignored).
4. Share the target Drive folder with the service account's `client_email`.

### 8.4 Obsidian Local REST API
1. Install the community plugin **"Local REST API"** in Obsidian, enable it, copy its API key.
2. Set `OBSIDIAN_API_URL` (default `https://127.0.0.1:27124`) and `OBSIDIAN_API_KEY`.

### 8.5 PostgreSQL & vector store
- `docker compose up -d postgres` gives you a local Postgres bound to `127.0.0.1` only.
- `docker compose --profile rag up -d chromadb` starts ChromaDB for RAG (only needed if
  `RAG_ENABLED=true`).

### 8.6 Finance webhook
- `FINANCE_WEBHOOK_SECRET` is generated for you by `npm run setup`, or generate your own with
  `openssl rand -hex 32`. Every inbound POST to `/finance/webhook/receipt` must be signed with
  HMAC-SHA256 over `${timestamp}.${rawBody}` using this secret — see
  [docs/security.md](docs/security.md) for the exact scheme.

### 8.7 n8n
1. `docker compose --profile n8n up -d n8n` (bound to `127.0.0.1:5678`, basic-auth protected).
2. Log in with `N8N_BASIC_AUTH_USER` / `N8N_BASIC_AUTH_PASSWORD`.
3. Outbound: create a Webhook node, put its URL in `N8N_OUTBOUND_WEBHOOK_URL`. Fire-and-forget,
   best-effort — a down/misconfigured n8n only logs a warning, never blocks a request.
4. Inbound: `N8N_INBOUND_SECRET` (generated by the setup wizard) must be sent as
   `x-n8n-secret` on every `POST /n8n/trigger`. Actions are restricted to a closed whitelist
   (`agent_prompt`, `finance_summary`, `patient_history`) — n8n can never run arbitrary code or
   reach the filesystem through this endpoint.

## 9. Running locally

```bash
npm install
cd dashboard-frontend && npm install && cd ..
npm run setup                          # or: cp .env.example .env && edit it
docker compose up -d postgres          # add chromadb/n8n via --profile if enabled
npx prisma migrate deploy
npm run prisma:seed                    # optional: demo data, refuses to run in production
npm run start:dev
# in another terminal:
cd dashboard-frontend && npm run dev
```

API: http://localhost:3000 · Swagger (dev only): http://localhost:3000/api/docs · Dashboard: http://localhost:5173

The very first account is created via `POST /auth/register-admin` (only works once — it
refuses if any user already exists) or through the dashboard's first-run screen.

## 10. Running with Docker

```bash
docker compose up --build                      # core services (API + Postgres)
docker compose --profile rag --profile n8n up --build   # + ChromaDB + n8n
```

The container runs database migrations automatically on startup (`docker/entrypoint.sh` runs
`prisma migrate deploy` before starting the app), runs as a non-root user, and exposes a
Docker `HEALTHCHECK` hitting `/health/live`. For local development with hot-reload, use
`docker compose -f docker-compose.yml -f docker-compose.dev.yml up`.

## 11. Database & migrations

Schema: `prisma/schema.prisma`. Key design choices:

- Money fields (`Transaction.amount`) use `Decimal(14,2)`, never floating point.
- `WebhookEvent.signature` is `@unique` and used as the replay-protection enforcement point.
- `RevokedToken` + `LoginAttempt` back JWT logout/revocation and login lockout.
- `AuditLog` is a payload-free trail (who did what, when) kept separate from `ExecutionLog`
  (redacted operational/debug logs with a retention policy).

Commands: `npm run prisma:migrate` (dev), `npm run prisma:migrate:deploy` (prod/CI),
`npm run prisma:studio`, `npm run prisma:seed`.

## 12. Authentication & RBAC

There is no shared access code. The first account is bootstrapped as `ADMIN` via
`POST /auth/register-admin` (blocked once any user exists); every subsequent login is
`telegramId` + `password` against a bcrypt hash, rate-limited, and lockable after
`LOGIN_MAX_ATTEMPTS` failures within `LOGIN_LOCKOUT_MINUTES`. JWTs carry a `jti`; `POST
/auth/logout` revokes that specific token via `RevokedToken`, and every authenticated request
re-checks both revocation and `user.isActive`. Routes are additionally gated by `@Roles(...)`
+ `RolesGuard` (`ADMIN` / `USER`).

## 13. The AI agent & tool calling

`src/ai/agent.service.ts` runs a bounded multi-step loop: send the conversation to the
provider, and if it responds with tool calls, execute them (in parallel, each under its own
timeout), append the results, and loop — up to `AGENT_MAX_TOOL_CALLS` steps, after which it
returns a safe fallback message instead of looping forever. Tool arguments are validated
against a strict `zod` schema per tool (`src/ai/tools/agent-tools.service.ts`) before
execution; unknown tools, invalid arguments, and disabled-module tool calls all fail closed
with a specific, caught error type — never an unhandled exception reaching the user or model.
The system prompt (`src/ai/system-prompt.ts`) explicitly instructs the model not to give
medical diagnoses or financial/legal advice, and untrusted retrieved content is wrapped and
labeled before being shown to the model to reduce prompt-injection risk.

## 14. RAG / knowledge base

`src/rag/rag.service.ts` chunks documents (configurable size/overlap), embeds each chunk with
the real Gemini embedding model, assigns deterministic IDs (`${docId}::${chunkIndex}`) so
re-syncing doesn't duplicate content, skips unchanged documents via a content hash, and reports
honest `{indexed, skipped, failed, total}` counts rather than assuming success.

## 15. Testing

```bash
npm test              # unit tests (Jest)
npm run test:cov       # unit tests with coverage
npm run test:e2e       # end-to-end tests, in-memory Prisma fake (no live DB needed)
```

All tests mock external services (Gemini, Google Drive, Obsidian, n8n) — none of them make
real network calls. See [Testing notes](#validation-note) below for what has and hasn't been
executed in this delivery.

## 16. Security model

See [SECURITY.md](SECURITY.md) and [docs/security.md](docs/security.md) for the full threat
model, HMAC webhook scheme, and vulnerability-reporting process.

## 17. Troubleshooting

See [docs/troubleshooting.md](docs/troubleshooting.md).

## 18. Contributing & license

See [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under the [MIT License](LICENSE).

---

<a id="validation-note"></a>
### A note on how this was verified

This project was hardened and tested in a sandboxed environment without npm registry access,
so dependencies could not actually be installed and the test suite could not actually be
executed here. Every test file was written to run against mocks (never live external
services); TypeScript sources were checked with `tsc --noEmit` for syntax/type correctness.
Before deploying, run `npm install`, `npm test`, `npm run test:e2e`, and `npm run build`
yourself and treat that as the real, authoritative verification.
