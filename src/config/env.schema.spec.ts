import { validateEnv } from './env.schema';

const BASE_VALID_ENV = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(32),
  FINANCE_WEBHOOK_SECRET: 'development-finance-webhook-secret',
};

describe('validateEnv', () => {
  it('accepts a minimal valid development configuration', () => {
    const result = validateEnv(BASE_VALID_ENV);
    expect(result.NODE_ENV).toBe('development');
    expect(result.TELEGRAM_ENABLED).toBe(false);
    expect(result.FINANCE_MODULE_ENABLED).toBe(true);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateEnv({ ...BASE_VALID_ENV, DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-postgresql DATABASE_URL', () => {
    expect(() => validateEnv({ ...BASE_VALID_ENV, DATABASE_URL: 'mysql://user:pass@host/db' })).toThrow();
  });

  it('rejects a JWT_SECRET shorter than 32 characters', () => {
    expect(() => validateEnv({ ...BASE_VALID_ENV, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('rejects a placeholder JWT_SECRET in production', () => {
    expect(() =>
      validateEnv({
        ...BASE_VALID_ENV,
        NODE_ENV: 'production',
        JWT_SECRET: 'change_me_super_secret_jwt_key',
      }),
    ).toThrow();
  });

  it('accepts a strong, non-placeholder secret in production', () => {
    const strongSecret = 'x9k2m4p8q1w5e7r3t6y0u2i4o6p8a1s3d5f7g9h1j3k5';
    const result = validateEnv({
      ...BASE_VALID_ENV,
      NODE_ENV: 'production',
      JWT_SECRET: strongSecret,
      FINANCE_MODULE_ENABLED: 'true',
      FINANCE_WEBHOOK_SECRET: strongSecret,
      DASHBOARD_CORS_ORIGIN: 'https://dashboard.example.com',
    });
    expect(result.NODE_ENV).toBe('production');
  });

  it('rejects DASHBOARD_CORS_ORIGIN="*" in production', () => {
    const strongSecret = 'x9k2m4p8q1w5e7r3t6y0u2i4o6p8a1s3d5f7g9h1j3k5';
    expect(() =>
      validateEnv({
        ...BASE_VALID_ENV,
        NODE_ENV: 'production',
        JWT_SECRET: strongSecret,
        FINANCE_WEBHOOK_SECRET: strongSecret,
        DASHBOARD_CORS_ORIGIN: '*',
      }),
    ).toThrow(/DASHBOARD_CORS_ORIGIN/);
  });

  it('requires TELEGRAM_BOT_TOKEN when TELEGRAM_ENABLED=true', () => {
    expect(() =>
      validateEnv({
        ...BASE_VALID_ENV,
        TELEGRAM_ENABLED: 'true',
        GEMINI_API_KEY: 'some-key',
      }),
    ).toThrow(/TELEGRAM_BOT_TOKEN/);
  });

  it('requires GEMINI_API_KEY when Telegram is enabled', () => {
    expect(() =>
      validateEnv({
        ...BASE_VALID_ENV,
        TELEGRAM_ENABLED: 'true',
        TELEGRAM_BOT_TOKEN: 'token',
        TELEGRAM_WHITELIST_IDS: '123',
      }),
    ).toThrow(/GEMINI_API_KEY/);
  });

  it('requires FINANCE_WEBHOOK_SECRET when the finance module is enabled (default on)', () => {
    expect(() => validateEnv({ ...BASE_VALID_ENV, FINANCE_WEBHOOK_SECRET: '' })).toThrow(/FINANCE_WEBHOOK_SECRET/);
  });

  it('does not require FINANCE_WEBHOOK_SECRET when the finance module is disabled', () => {
    expect(() =>
      validateEnv({ ...BASE_VALID_ENV, FINANCE_MODULE_ENABLED: 'false', FINANCE_WEBHOOK_SECRET: '' }),
    ).not.toThrow();
  });
});
