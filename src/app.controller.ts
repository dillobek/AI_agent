import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { AppConfigService } from './config/app-config.service';
import { PrismaService } from './config/prisma.service';

/**
 * Health / readiness / liveness + per-module status.
 * Never exposes secret values — only booleans/enums describing whether a
 * module is enabled and whether its required configuration is present.
 */
@ApiTags('health')
@Controller()
export class AppController {
  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Liveness: process is up and can respond at all. No dependency checks. */
  @Get('health/live')
  @ApiExcludeEndpoint()
  live() {
    return { status: 'ok' };
  }

  /** Readiness: dependencies the app actually needs right now are reachable. */
  @Get('health/ready')
  @ApiExcludeEndpoint()
  async ready() {
    const database = await this.checkDatabase();
    const ok = database.status === 'up';
    return { status: ok ? 'ok' : 'degraded', database };
  }

  /** General health + per-module configuration status (used by the dashboard's status page). */
  @Get('health')
  async health() {
    const database = await this.checkDatabase();
    const flags = this.config.moduleFlags;

    return {
      status: database.status === 'up' ? 'ok' : 'degraded',
      service: 'ai-personal-assistant-ecosystem',
      environment: this.config.get('NODE_ENV'),
      timestamp: new Date().toISOString(),
      database,
      modules: {
        telegram: this.moduleStatus(flags.telegram, !!this.config.get('TELEGRAM_BOT_TOKEN')),
        googleDrive: this.moduleStatus(flags.googleDrive, !!this.config.get('GOOGLE_APPLICATION_CREDENTIALS')),
        obsidian: this.moduleStatus(flags.obsidian, !!this.config.get('OBSIDIAN_API_KEY')),
        rag: this.moduleStatus(flags.rag, !!this.config.get('CHROMA_URL') || this.config.get('VECTOR_STORE_PROVIDER') === 'pgvector'),
        n8n: this.moduleStatus(flags.n8n, !!this.config.get('N8N_INBOUND_SECRET')),
        finance: this.moduleStatus(flags.finance, !!this.config.get('FINANCE_WEBHOOK_SECRET')),
        patients: this.moduleStatus(flags.patients, true),
        dashboard: this.moduleStatus(flags.dashboard, true),
        aiAgent: this.moduleStatus(true, !!this.config.get('OPENAI_API_KEY')),
      },
    };
  }

  private moduleStatus(enabled: boolean, configured: boolean): 'disabled' | 'misconfigured' | 'enabled' {
    if (!enabled) return 'disabled';
    return configured ? 'enabled' : 'misconfigured';
  }

  private async checkDatabase(): Promise<{ status: 'up' | 'down'; latencyMs?: number }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up', latencyMs: Date.now() - start };
    } catch {
      return { status: 'down' };
    }
  }
}
