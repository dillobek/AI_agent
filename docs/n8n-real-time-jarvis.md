# n8n + Real-time Jarvis status

## Current implementation

The project already contains the backend contracts needed for a Jarvis-style assistant:

- `POST /n8n/trigger` — secured n8n → API actions.
- `N8N_OUTBOUND_WEBHOOK_URL` — API → n8n event notifications.
- `POST /voice/live-token` — short-lived Gemini Live credential.
- `POST /voice/execute-tool` — secured relay for Live function calls.
- `src/voice/voice.service.ts` — tool declarations and duplicate-call protection.

The intended real-time path is:

```text
Dashboard microphone
  -> Gemini Live WebSocket (browser)
  -> /voice/execute-tool (only when a tool is requested)
  -> NestJS tools / Prisma / Google / Obsidian
  -> n8n outbound webhook for automation and notifications
```

The browser receives the Live audio directly from Gemini. The permanent Gemini API key stays
on the backend; the browser receives only a short-lived, single-use token.

## Important status

The NestJS Live-token and tool-relay backend exists. A complete browser Live WebSocket client
was not found in `dashboard-frontend`, so the real-time voice experience is not complete yet.
The dashboard currently has text-agent and health/status surfaces. Before calling this a finished
real-time Jarvis, implement and test the browser session: microphone capture, speaker playback,
Live reconnect/token refresh, function-call responses, stop/mute controls, and permission errors.

## n8n setup

1. Start n8n with `docker compose --profile n8n up -d n8n`.
2. Set `N8N_ENABLED=true`, `N8N_INBOUND_SECRET` and `N8N_BASIC_AUTH_PASSWORD` in `.env`.
3. In n8n, create a Webhook node and set its production URL as `N8N_OUTBOUND_WEBHOOK_URL`.
4. For n8n → API calls, use `POST http://api:3000/n8n/trigger` from the Docker network.
5. Add header `x-n8n-secret: <same value as N8N_INBOUND_SECRET>`.

Supported inbound actions:

| action | required payload |
|---|---|
| `agent_prompt` | `{ "prompt": "..." }` |
| `finance_summary` | `{ "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }` |
| `patient_history` | `{ "personName": "..." }` |
| `get_today_plan` | `{}` |

Outbound events are best-effort notifications. If n8n is unavailable, the primary API request
continues and the failure is written to the execution log.

## GitHub release checklist

- Never commit `.env`, Telegram sessions, Google service-account JSON, database dumps, or n8n
  credentials.
- Rotate any credential that was ever pasted into a public repository.
- Run `pnpm install --frozen-lockfile`, `pnpm run lint`, `pnpm run build:all`, and `pnpm test`.
- Configure GitHub Actions secrets only for deployment; local `.env` values do not belong in Git.
- Use HTTPS for public n8n and Gemini Live deployments, and set an explicit CORS origin.
