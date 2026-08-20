import { z } from 'zod';

/**
 * Centralized, typed environment schema.
 *
 * This is the single source of truth for every configuration value the
 * application reads. Nothing outside this file (and `configuration.ts`,
 * which consumes it) should call `process.env` directly — see
 * `docs/architecture.md` for the rationale.
 *
 * Validation runs once at startup (wired into ConfigModule.forRoot via the
 * `validate` option in `configuration.ts`). An invalid environment throws
 * immediately with a readable message instead of letting the app boot into
 * a broken state.
 */

const KNOWN_PLACEHOLDER_SECRETS = new Set([
  '',
  'change_me',
  'change_me_super_secret_jwt_key',
  'change_me_webhook_signing_secret',
  'change_me_long_random_shared_secret',
  'change_me_strong_password',
  'change_me_obsidian_local_rest_api_key',
  'secret',
  'password',
  'changeme',
  'admin',
]);

function isPlaceholderSecret(value: string | undefined): boolean {
  if (!value) return true;
  return KNOWN_PLACEHOLDER_SECRETS.has(value.trim().toLowerCase());
}

/** Coerces the common "true"/"false"/"1"/"0" env-string forms into a boolean, defaulting to `false`. */
const boolEnv = (defaultValue = false) =>
  z.preprocess((v) => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return ['true', '1', 'yes', 'on'].includes(v.trim().toLowerCase());
    return defaultValue;
  }, z.boolean());

const intEnv = (defaultValue: number) =>
  z.preprocess((v) => {
    if (v === undefined || v === '') return defaultValue;
    const n = Number(v);
    return Number.isFinite(n) ? n : v;
  }, z.number().int());

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: intEnv(3000),

    // ---- Database ----
    DATABASE_URL: z
      .string()
      .min(1, 'DATABASE_URL is required')
      .refine((v) => v.startsWith('postgresql://') || v.startsWith('postgres://'), {
        message: 'DATABASE_URL must be a postgresql:// connection string',
      }),

    // ---- JWT / Dashboard auth ----
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().default('1d'),
    DASHBOARD_CORS_ORIGIN: z.string().default('http://localhost:5173'),

    // ---- Login security ----
    LOGIN_MAX_ATTEMPTS: intEnv(5),
    LOGIN_LOCKOUT_MINUTES: intEnv(15),
    OTP_TTL_MINUTES: intEnv(5),

    // ---- Optional module toggles ----
    TELEGRAM_ENABLED: boolEnv(false),
    PERSONAL_TELEGRAM_ENABLED: boolEnv(false),
    INSTAGRAM_ENABLED: boolEnv(false),
    GOOGLE_DRIVE_ENABLED: boolEnv(false),
    OBSIDIAN_ENABLED: boolEnv(false),
    RAG_ENABLED: boolEnv(false),
    N8N_ENABLED: boolEnv(false),
    FINANCE_MODULE_ENABLED: boolEnv(true),
    PATIENTS_MODULE_ENABLED: boolEnv(true),
    DASHBOARD_ENABLED: boolEnv(true),

    // ---- Telegram ----
    TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
    TELEGRAM_WHITELIST_IDS: z.string().optional().default(''),
    // Telegram personal-account (MTProto) connector. API ID/HASH are
    // created at my.telegram.org; the session itself is encrypted on VPS.
    TELEGRAM_API_ID: intEnv(0),
    TELEGRAM_API_HASH: z.string().optional().default(''),
    PERSONAL_TELEGRAM_PHONE: z.string().optional().default(''),
    PERSONAL_TELEGRAM_SESSION: z.string().optional().default(''),
    PERSONAL_TELEGRAM_SESSION_ENCRYPTION_KEY: z.string().optional().default(''),
    PERSONAL_REPLY_MAX_HISTORY: intEnv(24),
    // Your image worker (n8n, OpenAI-compatible service, etc.) receives
    // { prompt } and returns { imageUrl }. Keep its URL private.
    CHANNEL_IMAGE_GENERATION_WEBHOOK_URL: z.string().url().optional().or(z.literal('')).default(''),

    // ---- AI provider (Gemini today, adapter-based so others can be added) ----
    AI_PROVIDER: z.enum(['gemini']).default('gemini'),
    GEMINI_API_KEY: z.string().optional().default(''),
    GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
    GEMINI_EMBEDDING_MODEL: z.string().default('text-embedding-004'),

    // ---- Agent loop bounds ----
    AGENT_MAX_TOOL_CALLS: intEnv(6),
    AGENT_TOOL_TIMEOUT_MS: intEnv(15000),
    AGENT_MAX_PROMPT_CHARS: intEnv(8000),
    AGENT_MAX_TOOL_OUTPUT_CHARS: intEnv(6000),
    SESSION_TTL_MINUTES: intEnv(60),

    // ---- Google Drive ----
    GOOGLE_APPLICATION_CREDENTIALS: z.string().optional().default(''),
    GOOGLE_DRIVE_ROOT_FOLDER_ID: z.string().optional().default(''),
    GOOGLE_DRIVE_PAGE_SIZE: intEnv(25),

    // ---- Obsidian ----
    OBSIDIAN_API_URL: z.string().optional().default('https://127.0.0.1:27124'),
    OBSIDIAN_API_KEY: z.string().optional().default(''),
    OBSIDIAN_ALLOW_INSECURE_TLS: boolEnv(false),
    OBSIDIAN_REQUEST_TIMEOUT_MS: intEnv(10000),

    // ---- RAG / Vector store ----
    VECTOR_STORE_PROVIDER: z.enum(['chroma', 'pgvector']).default('chroma'),
    CHROMA_URL: z.string().optional().default('http://localhost:8000'),
    CHROMA_COLLECTION: z.string().default('patient_knowledge_base'),
    RAG_CHUNK_SIZE: intEnv(1000),
    RAG_CHUNK_OVERLAP: intEnv(150),
    RAG_SCORE_THRESHOLD: z.preprocess((v) => (v === undefined || v === '' ? 0.3 : Number(v)), z.number().min(0).max(1)),

    // ---- Finance webhook ----
    FINANCE_WEBHOOK_SECRET: z.string().optional().default(''),
    FINANCE_WEBHOOK_MAX_BODY_BYTES: intEnv(65536),
    FINANCE_WEBHOOK_REPLAY_WINDOW_SECONDS: intEnv(300),
    GMAIL_CLIENT_ID: z.string().optional().default(''),
    GMAIL_CLIENT_SECRET: z.string().optional().default(''),
    GMAIL_REFRESH_TOKEN: z.string().optional().default(''),

    // ---- n8n ----
    N8N_OUTBOUND_WEBHOOK_URL: z.string().optional().default(''),
    N8N_INBOUND_SECRET: z.string().optional().default(''),

    // ---- Outbound retry / anti-flood ----
    API_CALL_DELAY_MIN_MS: intEnv(1000),
    API_CALL_DELAY_MAX_MS: intEnv(2000),
    RETRY_MAX_ATTEMPTS: intEnv(4),
    RETRY_BASE_DELAY_MS: intEnv(300),

    // ---- Privacy / logging ----
    LOG_RETENTION_DAYS: intEnv(30),
    LOG_LEVEL: z.enum(['debug', 'log', 'warn', 'error']).default('log'),

    // ---- Global rate limiting ----
    RATE_LIMIT_TTL_SECONDS: intEnv(60),
    RATE_LIMIT_MAX: intEnv(120),
  })
  .superRefine((cfg, ctx) => {
    const isProd = cfg.NODE_ENV === 'production';

    const requirePresent = (key: keyof typeof cfg, label: string) => {
      if (!cfg[key]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${label} is required` });
      }
    };

    const rejectPlaceholderInProd = (key: keyof typeof cfg, label: string, minLen = 32) => {
      const value = cfg[key] as unknown as string;
      if (!isProd) return;
      if (isPlaceholderSecret(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${label} must not be left as a default/placeholder value in production`,
        });
      } else if (value.length < minLen) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${label} must be at least ${minLen} characters in production`,
        });
      }
    };

    // JWT secret always checked (dev and prod), placeholder only hard-fails in prod.
    rejectPlaceholderInProd('JWT_SECRET', 'JWT_SECRET');

    if (isProd && cfg.DASHBOARD_CORS_ORIGIN.trim() === '*') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DASHBOARD_CORS_ORIGIN'],
        message: 'DASHBOARD_CORS_ORIGIN cannot be "*" in production',
      });
    }

    if (isProd && cfg.OBSIDIAN_ALLOW_INSECURE_TLS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OBSIDIAN_ALLOW_INSECURE_TLS'],
        message: 'OBSIDIAN_ALLOW_INSECURE_TLS must not be enabled in production',
      });
    }

    if (cfg.TELEGRAM_ENABLED) {
      requirePresent('TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_TOKEN (required when TELEGRAM_ENABLED=true)');
      requirePresent('TELEGRAM_WHITELIST_IDS', 'TELEGRAM_WHITELIST_IDS (required when TELEGRAM_ENABLED=true)');
    }

    // The dashboard can boot and expose non-AI pages without an AI key. A
    // missing key is only fatal when an integration that invokes AI without
    // an interactive user explicitly requires it.
    const geminiNeeded = cfg.TELEGRAM_ENABLED || cfg.PERSONAL_TELEGRAM_ENABLED || cfg.INSTAGRAM_ENABLED || cfg.N8N_ENABLED || cfg.RAG_ENABLED;
    if (geminiNeeded && cfg.AI_PROVIDER === 'gemini' && !cfg.GEMINI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GEMINI_API_KEY'],
        message: 'GEMINI_API_KEY is required when Telegram, n8n, or RAG is enabled with AI_PROVIDER=gemini',
      });
    }

    if (cfg.PERSONAL_TELEGRAM_ENABLED) {
      if (cfg.TELEGRAM_API_ID <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['TELEGRAM_API_ID'], message: 'TELEGRAM_API_ID is required when PERSONAL_TELEGRAM_ENABLED=true' });
      }
      requirePresent('TELEGRAM_API_HASH', 'TELEGRAM_API_HASH (required when PERSONAL_TELEGRAM_ENABLED=true)');
      requirePresent('PERSONAL_TELEGRAM_PHONE', 'PERSONAL_TELEGRAM_PHONE (required when PERSONAL_TELEGRAM_ENABLED=true)');
      requirePresent('PERSONAL_TELEGRAM_SESSION_ENCRYPTION_KEY', 'PERSONAL_TELEGRAM_SESSION_ENCRYPTION_KEY (required when PERSONAL_TELEGRAM_ENABLED=true)');
      rejectPlaceholderInProd('PERSONAL_TELEGRAM_SESSION_ENCRYPTION_KEY', 'PERSONAL_TELEGRAM_SESSION_ENCRYPTION_KEY');
    }

    if (cfg.GOOGLE_DRIVE_ENABLED) {
      requirePresent('GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_APPLICATION_CREDENTIALS (required when GOOGLE_DRIVE_ENABLED=true)');
    }

    if (cfg.OBSIDIAN_ENABLED) {
      requirePresent('OBSIDIAN_API_URL', 'OBSIDIAN_API_URL (required when OBSIDIAN_ENABLED=true)');
      requirePresent('OBSIDIAN_API_KEY', 'OBSIDIAN_API_KEY (required when OBSIDIAN_ENABLED=true)');
    }

    if (cfg.N8N_ENABLED) {
      requirePresent('N8N_INBOUND_SECRET', 'N8N_INBOUND_SECRET (required when N8N_ENABLED=true)');
      rejectPlaceholderInProd('N8N_INBOUND_SECRET', 'N8N_INBOUND_SECRET');
      if (!isProd && cfg.N8N_INBOUND_SECRET && cfg.N8N_INBOUND_SECRET.length < 16) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['N8N_INBOUND_SECRET'],
          message: 'N8N_INBOUND_SECRET should be at least 16 characters',
        });
      }
    }

    if (cfg.FINANCE_MODULE_ENABLED) {
      requirePresent('FINANCE_WEBHOOK_SECRET', 'FINANCE_WEBHOOK_SECRET (required when FINANCE_MODULE_ENABLED=true)');
      rejectPlaceholderInProd('FINANCE_WEBHOOK_SECRET', 'FINANCE_WEBHOOK_SECRET');
    }

    if (cfg.RAG_ENABLED && cfg.VECTOR_STORE_PROVIDER === 'chroma') {
      requirePresent('CHROMA_URL', 'CHROMA_URL (required when RAG_ENABLED=true and VECTOR_STORE_PROVIDER=chroma)');
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `\n\nInvalid environment configuration:\n${details}\n\n` +
        'Fix the values above in your .env file (see .env.example), or run "npm run setup".\n',
    );
  }
  return result.data;
}
