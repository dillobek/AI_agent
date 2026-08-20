import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from './env.schema';

/**
 * Thin, typed wrapper around Nest's ConfigService<AppEnv>.
 *
 * Prefer injecting `AppConfigService` over raw `ConfigService`/`process.env`
 * throughout the codebase — it gives autocomplete + compile-time key
 * checking and is the one place that would need to change if the
 * underlying config source ever changed.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  get<K extends keyof AppEnv>(key: K): AppEnv[K] {
    return this.config.get(key, { infer: true });
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }

  get isDevelopment(): boolean {
    return this.get('NODE_ENV') === 'development';
  }

  /** Snapshot of which optional modules are enabled, for the health endpoint / module gating. */
  get moduleFlags() {
    return {
      telegram: this.get('TELEGRAM_ENABLED'),
      googleDrive: this.get('GOOGLE_DRIVE_ENABLED'),
      obsidian: this.get('OBSIDIAN_ENABLED'),
      rag: this.get('RAG_ENABLED'),
      n8n: this.get('N8N_ENABLED'),
      finance: this.get('FINANCE_MODULE_ENABLED'),
      patients: this.get('PATIENTS_MODULE_ENABLED'),
      dashboard: this.get('DASHBOARD_ENABLED'),
    };
  }
}
