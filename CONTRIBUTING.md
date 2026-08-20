# Contributing

Thanks for considering a contribution. This project favors small, reviewable changes over
large rewrites.

## Getting set up

```bash
npm install
npm run setup      # generates a local .env — use dummy/test credentials, never real ones
docker compose up -d postgres
npx prisma migrate deploy
npm test
```

## Before opening a pull request

1. **Never commit real secrets.** `.env`, `credentials/*.json`, and anything matching a secret
   pattern must stay out of version control (`.gitignore` already covers the common cases —
   extend it rather than working around it).
2. **Run the checks locally:**
   ```bash
   npm run lint
   npm test
   npm run test:e2e
   npm run build
   ```
3. **Add tests for new behavior**, especially anything security-relevant (auth, webhooks,
   input validation, module gating). Tests must not depend on a live external service — mock
   Gemini/Drive/Obsidian/n8n calls, and use the in-memory Prisma fake
   (`test/support/in-memory-prisma.ts`) for e2e coverage rather than a real database where
   practical.
4. **Keep modules optional.** If you add a new integration, it should be gated behind an
   `*_ENABLED` flag in `src/config/env.schema.ts`, fail closed when disabled
   (`@RequireModule` + `ModuleEnabledGuard`), and never assume any particular user's data.
5. **No hardcoded personal/user-specific data.** Anything specific to a deployment (names,
   phone numbers, folder IDs, API keys) belongs in `.env` or the database, never in source.

## Code style

- TypeScript, NestJS conventions (modules/providers/DTOs). Run `npm run format` before
  committing.
- Prefer explicit, typed errors (see the custom exception classes in `src/common/exceptions`
  and `src/ai/tools/agent-tools.service.ts`) over throwing raw strings or letting errors bubble
  unhandled.
- Validate all external input at the boundary — DTOs with `class-validator` for HTTP, `zod`
  schemas for tool-call arguments and environment configuration.

## Reporting bugs / requesting features

Open a GitHub issue with clear reproduction steps. For security issues, see
[SECURITY.md](SECURITY.md) instead of a public issue.

## License

By contributing, you agree your contributions are licensed under this project's
[MIT License](LICENSE).
