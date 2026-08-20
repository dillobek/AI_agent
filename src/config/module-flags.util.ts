/**
 * Reads the optional-module toggle flags directly from `process.env`.
 *
 * Why this exists separately from `AppConfigService`/`validateEnv`:
 * Nest's module graph (`@Module({ imports: [...] })`) is built statically at
 * class-decoration time, before dependency injection exists — so we cannot
 * ask the validated `ConfigService` which modules to import; the DI
 * container doesn't exist yet. This helper does the minimal, duplicate-free
 * parsing needed to answer "should this module be in the import array" only.
 * All *runtime* config reads (inside services/controllers) must go through
 * `AppConfigService`, not this file.
 */
function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue;
  return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export function readModuleFlagsFromEnv() {
  return {
    telegram: parseBool(process.env.TELEGRAM_ENABLED, false),
    personalTelegram: parseBool(process.env.PERSONAL_TELEGRAM_ENABLED, false),
    instagram: parseBool(process.env.INSTAGRAM_ENABLED, false),
    googleDrive: parseBool(process.env.GOOGLE_DRIVE_ENABLED, false),
    obsidian: parseBool(process.env.OBSIDIAN_ENABLED, false),
    rag: parseBool(process.env.RAG_ENABLED, false),
    n8n: parseBool(process.env.N8N_ENABLED, false),
    finance: parseBool(process.env.FINANCE_MODULE_ENABLED, true),
    patients: parseBool(process.env.PATIENTS_MODULE_ENABLED, true),
    dashboard: parseBool(process.env.DASHBOARD_ENABLED, true),
  };
}
