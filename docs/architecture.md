# Architecture

## Module graph

The app is a single NestJS process composed of independently toggleable feature modules,
wired together in `src/app.module.ts`. `AppConfigModule` is `@Global()` and loaded first — it
validates the entire environment via `src/config/env.schema.ts` before any other module
constructs, so a misconfigured deployment fails fast with a readable error rather than booting
into a half-working state.

```
AppConfigModule (global)         validated env, AppConfigService, moduleFlags
CommonModule (global)            ExecutionLogService, AuditLogService, ModuleEnabledGuard, CleanupService
AuthModule                       JWT strategy, RBAC guards, login/register/logout
AiProviderModule                 binds AI_PROVIDER_ADAPTER -> GeminiProviderAdapter (standalone, avoids cycles)
AiModule                         AgentService (bounded tool-calling loop), AgentToolsService
RagModule                        chunking + embeddings + vector store client
DriveModule / ObsidianModule     external knowledge sources (lazy clients, gated)
FinanceModule                    ledger + HMAC-verified webhook
PatientsModule                   medical CRM, enriched by Drive/RAG when enabled
N8nEventsModule / N8nModule      outbound notifier (standalone) / inbound trigger controller
DashboardModule                  aggregated read endpoints for the frontend
TelegramModule                   conditionally imported only when TELEGRAM_ENABLED=true
```

### Why `AiProviderModule` is separate from `AiModule`

`RagModule` needs embeddings (from the AI provider) and is imported by `PatientsModule`
(for RAG-backed patient history), while `AiModule` imports `PatientsModule` (for the
`get_patient_prescriptions` tool). If the AI provider binding lived inside `AiModule`, that
would create `RagModule → AiModule → PatientsModule → RagModule`, a circular import. Pulling
the provider binding into a standalone `AiProviderModule` (which imports nothing from
Drive/Finance/Patients) breaks the cycle: both `AiModule` and `RagModule` import
`AiProviderModule` directly.

### Why `N8nEventsModule` is separate from `N8nModule`

`FinanceService`/`PatientsService` need to *notify* n8n on events (outbound), while the inbound
`/n8n/trigger` controller needs to *call into* Finance/Patients/Ai (inbound). A single
`N8nModule` doing both would cycle. `N8nEventsModule` exports only `N8nService` (outbound) and
has no inbound dependencies; `N8nModule` owns the inbound controller and imports
Finance/Patients/Ai directly. Every module that wants to fire an outbound n8n event imports
`N8nEventsModule`, never `N8nModule`.

## Request lifecycle

1. `helmet()` security headers + request-ID middleware.
2. Raw-body-capturing `express.json()` (needed so the Finance webhook can HMAC over the exact
   bytes Express received, independent of how the DTO pipeline later transforms `req.body`).
3. Global `ValidationPipe` (`whitelist: true, forbidNonWhitelisted: true, transform: true`).
4. Global `ThrottlerGuard` (rate limiting) — `APP_GUARD` in `AppModule`.
5. Route-level guards in declared order, e.g. `@UseGuards(ModuleEnabledGuard, JwtAuthGuard,
   RolesGuard)` — module gating happens before authentication is even checked, so a disabled
   module always returns `503` regardless of whether the caller is authenticated.
6. Controller → service → Prisma. Errors are caught by `AllExceptionsFilter`, which sanitizes
   details in production and always includes the request ID for correlation.

## The agent loop

`AgentService.processUserCommand(prompt, channelKey)`:

1. Rejects prompts over `AGENT_MAX_PROMPT_CHARS` without calling the model.
2. Loads conversation history for `channelKey` (isolated per Telegram user / dashboard user /
   n8n request — see `ConversationSession.channelKey @unique`).
3. Calls the AI provider adapter with the system prompt, history, and the tool declarations
   `AgentToolsService.getAvailableDeclarations()` currently allows (filtered by `moduleFlags`).
4. If the model returns tool calls, executes them in parallel (`Promise.all`), each wrapped in
   `executeToolSafely` — its own timeout (`AGENT_TOOL_TIMEOUT_MS`) and a catch that converts
   any error (including unknown-tool, bad-arguments, and disabled-module errors) into a safe,
   non-leaking message fed back to the model — then loops.
5. Stops after `AGENT_MAX_TOOL_CALLS` steps with a fallback message if the model never returns
   a final answer, so a misbehaving or adversarial model can never loop forever.

## Data model highlights

See `prisma/schema.prisma`. Notable choices: `Transaction.amount` is `Decimal(14,2)` (never
floating point for money); `WebhookEvent.signature` is unique and doubles as the
replay-protection enforcement point; `RevokedToken`/`LoginAttempt` back JWT revocation and
login lockout; `AuditLog` is intentionally payload-free (who/what/when, not raw request
bodies) and kept separate from the redacted, retention-bound `ExecutionLog`.
