import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { redactForLog } from './utils/redaction.util';

/**
 * Central execution/debug log used by the Dashboard's "System execution
 * logs & AI tool calling activity monitor" (Module 5).
 *
 * This is deliberately NOT the security audit trail (see `AuditLogService`)
 * — it exists for debugging tool-calling behavior, so its entries are
 * redacted (diagnosis/phone/prompt/etc. masked, long strings truncated)
 * before being persisted, and are subject to LOG_RETENTION_DAYS cleanup.
 */
@Injectable()
export class ExecutionLogService {
  private readonly logger = new Logger(ExecutionLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: {
    actor: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
    success?: boolean;
    errorMsg?: string;
  }) {
    try {
      return await this.prisma.executionLog.create({
        data: {
          actor: entry.actor,
          toolName: entry.toolName,
          input: redactForLog(entry.input) as any,
          output: redactForLog(entry.output) as any,
          success: entry.success ?? true,
          errorMsg: entry.errorMsg ? String(entry.errorMsg).slice(0, 500) : undefined,
        },
      });
    } catch (err) {
      // Logging must never break the primary request flow.
      this.logger.warn(`Failed to persist execution log: ${(err as Error).message}`);
      return null;
    }
  }

  async recent(limit = 50) {
    return this.prisma.executionLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /** Deletes execution log rows older than the configured retention window. Invoked by a scheduled job. */
  async purgeOlderThan(retentionDays: number) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.executionLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    if (result.count > 0) {
      this.logger.log(`Purged ${result.count} execution log rows older than ${retentionDays}d`);
    }
    return result.count;
  }
}
