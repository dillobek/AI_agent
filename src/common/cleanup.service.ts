import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../config/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { ExecutionLogService } from './execution-log.service';

/**
 * Scheduled housekeeping: expired conversation sessions, expired revoked-JWT
 * records, and execution logs past their retention window. Runs hourly —
 * cheap no-op most of the time, keeps the database from growing unbounded.
 */
@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly executionLog: ExecutionLogService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runHousekeeping() {
    const [sessions, tokens] = await Promise.all([
      this.prisma.conversationSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      this.prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    ]);
    const logs = await this.executionLog.purgeOlderThan(this.config.get('LOG_RETENTION_DAYS'));

    if (sessions.count || tokens.count || logs) {
      this.logger.debug(
        `Housekeeping: ${sessions.count} sessions, ${tokens.count} revoked tokens, ${logs} execution logs purged`,
      );
    }
  }
}
