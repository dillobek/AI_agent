# Troubleshooting

## "Invalid environment configuration" at startup

The app prints exactly which variable(s) are missing/invalid and why, e.g.:

```
Invalid environment configuration:
  - JWT_SECRET: JWT_SECRET must be at least 32 characters
  - FINANCE_WEBHOOK_SECRET: FINANCE_WEBHOOK_SECRET (required when FINANCE_MODULE_ENABLED=true)
```

Fix: edit `.env` for the listed keys, or re-run `npm run setup`. See the
[environment variables reference](../README.md#6-environment-variables-reference) for what
each one means.

## `npm run start:dev` can't connect to the database

- Confirm Postgres is running: `docker compose ps`.
- Confirm `DATABASE_URL` in `.env` matches the credentials/port in `docker-compose.yml`
  (defaults to `postgresql://postgres:postgres@localhost:5432/assistant`, adjust if you
  changed the wizard's defaults).
- Run migrations: `npx prisma migrate deploy`.

## `GET /health` shows a module as `misconfigured`

This means the module's `*_ENABLED` flag is `true` but a required credential for it is
missing or invalid. Check the module's section in the
[environment variables reference](../README.md#6-environment-variables-reference) and the
relevant [credential setup guide](../README.md#8-credential-setup-guides).

## A route returns `503 Service Unavailable`

That module is disabled (`*_ENABLED=false`) or misconfigured. This is intentional —
`ModuleEnabledGuard` fails closed rather than letting a request reach a half-initialized
service. Enable the module in `.env` (or via `npm run setup`) and provide its credentials.

## Finance webhook returns `403`

Checklist:
- `FINANCE_WEBHOOK_SECRET` in `.env` matches whatever you're signing with on the sender side.
- The signature is `HMAC-SHA256(secret, "${timestamp}.${rawBody}")` — the timestamp string
  must be concatenated with the *exact* raw JSON body bytes, not a re-serialized copy.
- The timestamp is within `FINANCE_WEBHOOK_REPLAY_WINDOW_SECONDS` (default 300s) of "now."
- You aren't resending an already-processed signature — each signed request is single-use.

## Telegram bot doesn't respond

- `TELEGRAM_ENABLED=true` and `TELEGRAM_BOT_TOKEN` set.
- Your numeric Telegram user ID (from **@userinfobot**) is in `TELEGRAM_WHITELIST_IDS`
  (comma-separated). Messages from anyone else are silently rejected by design.
- Check `GET /health` — if Telegram shows `misconfigured`, the token/whitelist is missing.

## AI agent (Telegram/dashboard/n8n) errors with "temporarily unavailable" or similar

- `GEMINI_API_KEY` is required whenever Telegram, RAG, n8n, or the dashboard is enabled with
  `AI_PROVIDER=gemini`. Confirm it's set and valid.
- Check the agent step/timeout bounds (`AGENT_MAX_TOOL_CALLS`, `AGENT_TOOL_TIMEOUT_MS`) —
  a very low timeout can cause legitimate slow tool calls (e.g. a large Drive search) to fail;
  raise them if needed.

## `npm run test:e2e` fails to find a database

It shouldn't need one — the e2e suite (`test/app.e2e-spec.ts`) overrides `PrismaService` with
an in-memory fake (`test/support/in-memory-prisma.ts`). If you see a real database connection
error, check that nothing else in your test environment is bypassing the
`.overrideProvider(PrismaService)` call, and that `test/jest-e2e.json` is being used
(`npm run test:e2e` passes `--config ./test/jest-e2e.json` for exactly this reason).

## Docker container keeps restarting

- Check logs: `docker compose logs -f api`.
- Most commonly this is the same "Invalid environment configuration" error as above — the
  container's `.env` (or compose `environment:` block) is missing a required value.
- Confirm Postgres is healthy first: `docker compose ps` should show `postgres` as `healthy`
  before `api` finishes its own healthcheck.

## I want to reset everything and start over

```bash
docker compose down -v   # WARNING: deletes the Postgres volume (all data)
npm run setup             # regenerate .env
docker compose up -d postgres
npx prisma migrate deploy
```

## Still stuck?

Open a GitHub issue with: your `NODE_ENV`, which modules are enabled (from `/health`, with
secrets redacted), the exact error message, and steps to reproduce. Never paste your actual
`.env` contents or real credentials into an issue.
