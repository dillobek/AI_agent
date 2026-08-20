#!/usr/bin/env node
'use strict';

/**
 * Interactive onboarding: `pnpm run setup`.
 *
 * Walks a new user through generating a working `.env` file without
 * requiring them to understand every variable in `.env.example` up front.
 * Design goals (see the project's onboarding requirements in README.md):
 *
 *  - Every optional integration (Telegram, Google Drive, Obsidian, RAG,
 *    n8n) is opt-in; declining just leaves it disabled, nothing crashes.
 *  - Secrets (JWT signing key, webhook secrets) are generated with
 *    crypto.randomBytes — never typed by the user, never printed.
 *  - Values the user DOES type that are credential-shaped (API keys,
 *    tokens, passwords) are read with terminal echo turned off and are
 *    never echoed back in a "you entered: ..." confirmation.
 *  - An existing `.env` is never silently overwritten.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
}

/** Prompts with terminal echo disabled — used for anything credential-shaped. */
function askSecret(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    let value = '';
    const onData = (char) => {
      const c = char.toString('utf8');
      if (c === '\n' || c === '\r') {
        stdin.setRawMode(false);
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(value.trim());
        return;
      }
      if (c === '\u0003') {
        // Ctrl+C
        stdin.setRawMode(false);
        process.stdout.write('\n');
        process.exit(1);
      }
      if (c === '\u007f' || c === '\b') {
        // Backspace
        value = value.slice(0, -1);
        return;
      }
      value += c;
    };
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function askYesNo(question, defaultYes) {
  const suffix = defaultYes ? ' [Y/n] ' : ' [y/N] ';
  const answer = (await ask(question + suffix)).toLowerCase();
  if (!answer) return defaultYes;
  return answer.startsWith('y');
}

function generateSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
  console.log('─'.repeat(title.length));
}

async function main() {
  console.log('\n\x1b[1mAI Personal Assistant Ecosystem — setup\x1b[0m');
  console.log('This will generate a .env file for you. Nothing is sent anywhere;');
  console.log('everything you enter stays in this local file.\n');

  if (fs.existsSync(ENV_PATH)) {
    const overwrite = await askYesNo('.env already exists. Overwrite it?', false);
    if (!overwrite) {
      console.log('Keeping the existing .env. Nothing was changed.');
      rl.close();
      return;
    }
  }

  const env = {};

  section('Basics');
  env.NODE_ENV = (await ask('Environment (development/production) [development]: ')) || 'development';
  env.PORT = (await ask('API port [3000]: ')) || '3000';
  const dockerDeployment = await askYesNo('Will you run the application with Docker Compose?', true);
  if (dockerDeployment) {
    env.POSTGRES_USER = 'ai_assistant';
    env.POSTGRES_PASSWORD = generateSecret(24);
    env.POSTGRES_DB = 'ai_assistant_db';
    env.DATABASE_URL = `postgresql://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}@postgres:5432/${env.POSTGRES_DB}?schema=public`;
    console.log('Generated a strong PostgreSQL password for the Docker deployment.');
  } else {
    env.DATABASE_URL =
      (await ask('PostgreSQL connection URL [postgresql://ai_assistant:ai_assistant_password@localhost:5432/ai_assistant_db?schema=public]: ')) ||
      'postgresql://ai_assistant:ai_assistant_password@localhost:5432/ai_assistant_db?schema=public';
  }
  const defaultDashboardOrigin = dockerDeployment ? 'http://localhost:8080' : 'http://localhost:5173';
  env.DASHBOARD_CORS_ORIGIN =
    (await ask(`Dashboard frontend origin for CORS [${defaultDashboardOrigin}]: `)) || defaultDashboardOrigin;

  console.log('\nGenerating JWT signing secret and login-security defaults automatically...');
  env.JWT_SECRET = generateSecret(32);
  env.JWT_EXPIRES_IN = '1d';
  env.LOGIN_MAX_ATTEMPTS = '5';
  env.LOGIN_LOCKOUT_MINUTES = '15';
  env.OTP_TTL_MINUTES = '5';

  section('Optional modules');
  console.log('Each of these can be skipped — the app runs fine with none of them enabled,');
  console.log('and each disabled module reports itself clearly on the /health endpoint.\n');

  const telegramEnabled = await askYesNo('Enable the Telegram bot?', false);
  env.TELEGRAM_ENABLED = String(telegramEnabled);
  if (telegramEnabled) {
    console.log('  Get a bot token from @BotFather on Telegram, and your numeric user id from @userinfobot.');
    env.TELEGRAM_BOT_TOKEN = await askSecret('  Telegram bot token (input hidden): ');
    env.TELEGRAM_WHITELIST_IDS = await ask('  Authorized Telegram user IDs, comma-separated: ');
  } else {
    env.TELEGRAM_BOT_TOKEN = '';
    env.TELEGRAM_WHITELIST_IDS = '';
  }

  const financeEnabled = await askYesNo('Enable the Finance module?', true);
  env.FINANCE_MODULE_ENABLED = String(financeEnabled);
  if (financeEnabled) {
    console.log('  Generating a Finance webhook signing secret automatically...');
    env.FINANCE_WEBHOOK_SECRET = generateSecret(32);
  } else {
    env.FINANCE_WEBHOOK_SECRET = '';
  }
  env.FINANCE_WEBHOOK_MAX_BODY_BYTES = '65536';
  env.FINANCE_WEBHOOK_REPLAY_WINDOW_SECONDS = '300';
  env.GMAIL_CLIENT_ID = '';
  env.GMAIL_CLIENT_SECRET = '';
  env.GMAIL_REFRESH_TOKEN = '';

  env.PATIENTS_MODULE_ENABLED = String(await askYesNo('Enable the Patients/Medical CRM module?', true));
  env.DASHBOARD_ENABLED = String(await askYesNo('Enable the web Dashboard API?', true));

  const needsAi = telegramEnabled || (await askYesNo('Will you use the AI agent from the Dashboard or n8n?', true));
  env.AI_PROVIDER = 'gemini';
  if (needsAi) {
    console.log('  Get a key from https://aistudio.google.com/app/apikey');
    env.GEMINI_API_KEY = await askSecret('  Gemini API key (input hidden): ');
  } else {
    env.GEMINI_API_KEY = '';
  }
  env.GEMINI_MODEL = 'gemini-2.5-flash';
  env.GEMINI_EMBEDDING_MODEL = 'text-embedding-004';
  env.AGENT_MAX_TOOL_CALLS = '6';
  env.AGENT_TOOL_TIMEOUT_MS = '15000';
  env.AGENT_MAX_PROMPT_CHARS = '8000';
  env.AGENT_MAX_TOOL_OUTPUT_CHARS = '6000';
  env.SESSION_TTL_MINUTES = '60';

  const driveEnabled = await askYesNo('Enable Google Drive integration?', false);
  env.GOOGLE_DRIVE_ENABLED = String(driveEnabled);
  if (driveEnabled) {
    console.log('  You need a Google Cloud service-account JSON key with Drive API access.');
    console.log('  See docs/installation.md section "Google Drive" for the full walkthrough.');
    const credDir = path.join(ROOT, 'credentials');
    if (!fs.existsSync(credDir)) {
      fs.mkdirSync(credDir, { recursive: true });
      console.log(`  Created ${path.relative(ROOT, credDir)}/ — place your service-account JSON there.`);
    }
    env.GOOGLE_APPLICATION_CREDENTIALS =
      (await ask('  Path to the service-account JSON [./credentials/google-service-account.json]: ')) ||
      './credentials/google-service-account.json';
    const resolvedPath = path.resolve(ROOT, env.GOOGLE_APPLICATION_CREDENTIALS);
    if (!fs.existsSync(resolvedPath)) {
      console.log(`  ⚠ ${env.GOOGLE_APPLICATION_CREDENTIALS} doesn't exist yet — add the file before starting the app.`);
    }
    env.GOOGLE_DRIVE_ROOT_FOLDER_ID = await ask('  Optional: restrict search to a Drive folder ID (leave blank for none): ');
  } else {
    env.GOOGLE_APPLICATION_CREDENTIALS = '';
    env.GOOGLE_DRIVE_ROOT_FOLDER_ID = '';
  }
  env.GOOGLE_DRIVE_PAGE_SIZE = '25';

  const obsidianEnabled = await askYesNo('Enable Obsidian integration?', false);
  env.OBSIDIAN_ENABLED = String(obsidianEnabled);
  if (obsidianEnabled) {
    console.log('  Install the "Local REST API" community plugin in Obsidian and copy its API key.');
    env.OBSIDIAN_API_URL = (await ask('  Obsidian API URL [https://127.0.0.1:27124]: ')) || 'https://127.0.0.1:27124';
    env.OBSIDIAN_API_KEY = await askSecret('  Obsidian API key (input hidden): ');
    env.OBSIDIAN_ALLOW_INSECURE_TLS = String(
      env.NODE_ENV !== 'production' &&
        (await askYesNo('  Obsidian is using a self-signed local cert (dev only)?', true)),
    );
  } else {
    env.OBSIDIAN_API_URL = 'https://127.0.0.1:27124';
    env.OBSIDIAN_API_KEY = '';
    env.OBSIDIAN_ALLOW_INSECURE_TLS = 'false';
  }
  env.OBSIDIAN_REQUEST_TIMEOUT_MS = '10000';

  const ragEnabled = await askYesNo('Enable RAG / vector search (requires ChromaDB)?', false);
  env.RAG_ENABLED = String(ragEnabled);
  env.VECTOR_STORE_PROVIDER = 'chroma';
  env.CHROMA_URL = ragEnabled ? (await ask('  ChromaDB URL [http://localhost:8000]: ')) || 'http://localhost:8000' : 'http://localhost:8000';
  env.CHROMA_COLLECTION = 'patient_knowledge_base';
  env.RAG_CHUNK_SIZE = '1000';
  env.RAG_CHUNK_OVERLAP = '150';
  env.RAG_SCORE_THRESHOLD = '0.3';

  const n8nEnabled = await askYesNo('Enable n8n workflow automation?', false);
  env.N8N_ENABLED = String(n8nEnabled);
  if (n8nEnabled) {
    console.log('  Generating an n8n inbound secret automatically...');
    env.N8N_INBOUND_SECRET = generateSecret(32);
    env.N8N_OUTBOUND_WEBHOOK_URL = await ask('  n8n Webhook node URL to notify (leave blank to skip): ');
    env.N8N_BASIC_AUTH_USER = (await ask('  n8n dashboard username [admin]: ')) || 'admin';
    env.N8N_BASIC_AUTH_PASSWORD = generateSecret(12);
    env.N8N_HOST = 'localhost';
    env.N8N_PROTOCOL = 'http';
    env.N8N_WEBHOOK_URL = 'http://localhost:5678/';
    env.GENERIC_TIMEZONE = (await ask('  Timezone for n8n [UTC]: ')) || 'UTC';
  } else {
    env.N8N_INBOUND_SECRET = '';
    env.N8N_OUTBOUND_WEBHOOK_URL = '';
    env.N8N_BASIC_AUTH_USER = 'admin';
    env.N8N_BASIC_AUTH_PASSWORD = generateSecret(12);
    env.N8N_HOST = 'localhost';
    env.N8N_PROTOCOL = 'http';
    env.N8N_WEBHOOK_URL = 'http://localhost:5678/';
    env.GENERIC_TIMEZONE = 'UTC';
  }

  env.API_CALL_DELAY_MIN_MS = '1000';
  env.API_CALL_DELAY_MAX_MS = '2000';
  env.RETRY_MAX_ATTEMPTS = '4';
  env.RETRY_BASE_DELAY_MS = '300';
  env.LOG_RETENTION_DAYS = '30';
  env.LOG_LEVEL = 'log';
  env.RATE_LIMIT_TTL_SECONDS = '60';
  env.RATE_LIMIT_MAX = '120';

  writeEnvFile(env);

  section('Done');
  console.log(`Wrote ${path.relative(ROOT, ENV_PATH)}`);
  console.log('\nNext steps:');
  console.log('  1. corepack enable && pnpm install');
  console.log('  2. docker compose up -d postgres' + (env.RAG_ENABLED === 'true' ? ' chromadb' : ''));
  console.log('  3. pnpm exec prisma migrate deploy');
  console.log('  4. pnpm run start:dev');
  if (env.TELEGRAM_ENABLED !== 'true' && env.GEMINI_API_KEY === '') {
    console.log('\n(You skipped Telegram and Gemini — you can re-run "pnpm run setup" anytime to add them later.)');
  }
  console.log('\nCreate your first admin account with:');
  console.log('  curl -X POST http://localhost:' + env.PORT + '/auth/register-admin \\');
  console.log('    -H "Content-Type: application/json" \\');
  console.log('    -d \'{"telegramId":"<your id>","name":"<your name>","password":"<a strong password>"}\'');

  rl.close();
}

function writeEnvFile(env) {
  const lines = [
    '# Generated by `pnpm run setup`. Edit freely — re-running setup will ask before overwriting.',
    '# Never commit this file.',
    '',
    ...Object.entries(env).map(([key, value]) => `${key}=${formatEnvValue(value)}`),
    '',
  ];
  fs.writeFileSync(ENV_PATH, lines.join('\n'), { mode: 0o600 });
}

function formatEnvValue(value) {
  const str = String(value);
  // Quote values containing whitespace or special shell characters so the
  // file stays valid regardless of what the user typed.
  if (/[\s#"'$]/.test(str)) {
    return `"${str.replace(/"/g, '\\"')}"`;
  }
  return str;
}

main().catch((err) => {
  console.error('\nSetup failed:', err.message);
  rl.close();
  process.exit(1);
});
