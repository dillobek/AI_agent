# Installation guide

This guide is written for someone setting this project up for the first time, without prior
NestJS/Prisma experience.

## 1. Prerequisites

Install:
- [Node.js](https://nodejs.org/) 20 or later
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (recommended — gives you
  Postgres, and optionally ChromaDB/n8n, with no manual database setup)
- `git`

## 2. Clone and install dependencies

```bash
git clone <your-fork-url> ai-personal-assistant-ecosystem
cd ai-personal-assistant-ecosystem
npm install
cd dashboard-frontend && npm install && cd ..
```

## 3. Configure your environment

Run the interactive wizard:

```bash
npm run setup
```

It will ask which optional features you want (you can say no to everything except the core —
Finance/Patients/Dashboard are on by default and Telegram/Drive/Obsidian/RAG/n8n are opt-in),
generate strong secrets for you automatically, and write a `.env` file. Answer honestly about
which external services you actually have credentials for — you can always re-run
`npm run setup` later to add more.

If you'd rather configure by hand, copy `.env.example` to `.env` and fill in the values;
each one is commented, and the full reference is in the main [README](../README.md#6-environment-variables-reference).

## 4. Start the database

```bash
docker compose up -d postgres
```

This starts PostgreSQL bound to `127.0.0.1:5432` (not exposed beyond your own machine).

If you enabled RAG or n8n during setup, also start those:

```bash
docker compose --profile rag up -d chromadb
docker compose --profile n8n up -d n8n
```

## 5. Run database migrations

```bash
npx prisma migrate deploy
npx prisma generate
```

This creates all the tables the app needs. It's safe to re-run.

## 6. (Optional) Seed demo data

```bash
npm run prisma:seed
```

This creates one demo patient record and prints a random admin password to your terminal
(never stored anywhere) — refuses to run at all if `NODE_ENV=production`.

## 7. Start the app

```bash
npm run start:dev
```

Visit http://localhost:3000/health — you should see `{"status":"ok", ...}` with each module
listed as `enabled`, `disabled`, or `misconfigured`.

In a second terminal, start the dashboard:

```bash
cd dashboard-frontend && npm run dev
```

Visit http://localhost:5173. The first time, use the registration screen (or
`POST /auth/register-admin` directly) to create your admin account — this only works once.

## 8. Running everything via Docker instead

If you'd rather not install Node.js locally at all:

```bash
npm run setup             # still needed once, to generate .env
docker compose up --build
```

The container applies migrations automatically on startup and runs as a non-root user.

## 9. Verifying the install

```bash
npm test          # unit tests
npm run test:e2e  # end-to-end tests (no live database needed — uses an in-memory fake)
npm run build     # production build
```

If any of these fail, see [troubleshooting.md](troubleshooting.md).

## 10. Upgrading later

```bash
git pull
npm install
npx prisma migrate deploy
npm run build
```

Re-run `npm run setup` only if you want to change which modules are enabled or rotate secrets.
