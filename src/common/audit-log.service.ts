import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';

export interface AuditEntry {
  userId?: string;
  actorLabel: string;
  action: string;
  resource?: string;
  ipAddress?: string;
}

/**
 * Security audit trail — who did what, to which resource, when. Kept
 * strictly separate from ExecutionLog: never stores prompt text, diagnosis,
 * tool input/output, or any other PII payload, only identifiers. This is
 * what answers "who looked at this patient's record" during an incident
 * review.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry) {
    try {
      return await this.prisma.auditLog.create({
        data: {
          userId: entry.userId,
          actorLabel: entry.actorLabel,
          action: entry.action,
          resource: entry.resource,
          ipAddress: entry.ipAddress,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to persist audit log: ${(err as Error).message}`);
      return null;
    }
  }

  async recent(limit = 100) {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }
}
