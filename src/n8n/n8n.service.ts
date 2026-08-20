import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ExecutionLogService } from '../common/execution-log.service';

/**
 * n8n Workflow Automation integration (outbound side).
 *
 * Posts structured, whitelisted event payloads to a single n8n Webhook node
 * URL (N8N_OUTBOUND_WEBHOOK_URL). This is a one-way, best-effort notification:
 * failures are logged and swallowed so a down/misconfigured n8n instance can
 * never break the primary request flow (patient CRUD, finance ingestion,
 * Telegram replies, etc).
 *
 * Only ever sends data the caller explicitly builds and passes in — it does
 * not read arbitrary process state, files, environment variables, or system
 * information, and it never executes anything received back from n8n.
 */
@Injectable()
export class N8nService {
  private readonly logger = new Logger(N8nService.name);
  private readonly webhookUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly executionLog: ExecutionLogService,
  ) {
    this.webhookUrl = this.config.get<string>('N8N_OUTBOUND_WEBHOOK_URL', '');
  }

  /**
   * Fires an event to n8n. `event` should be one of a small, known set
   * (e.g. "patient.prescription_created", "finance.transaction_ingested")
   * and `payload` should only contain the fields the workflow actually needs.
   */
  async notifyEvent(event: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.webhookUrl) {
      this.logger.debug(`N8N_OUTBOUND_WEBHOOK_URL not set — skipping "${event}" notification`);
      return;
    }

    try {
      await axios.post(
        this.webhookUrl,
        { event, payload, source: 'ai-personal-assistant-ecosystem', timestamp: new Date().toISOString() },
        { timeout: 5000 },
      );
      await this.executionLog.record({ actor: 'n8n-outbound', toolName: event, input: payload });
    } catch (err) {
      const errorMsg = (err as Error).message;
      this.logger.warn(`Failed to notify n8n for event "${event}": ${errorMsg}`);
      await this.executionLog.record({
        actor: 'n8n-outbound',
        toolName: event,
        input: payload,
        success: false,
        errorMsg,
      });
    }
  }
}
