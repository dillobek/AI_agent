import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../config/prisma.service';

/**
 * Verifies inbound Finance webhook requests (receipt/invoice ingestion).
 *
 * Security properties:
 *  - Fail-closed: if FINANCE_WEBHOOK_SECRET isn't configured, every request
 *    is rejected (503) rather than silently accepted.
 *  - HMAC-SHA256 is computed over `${timestamp}.${rawBody}` (the *exact*
 *    bytes Express received, captured via the `verify` hook in main.ts —
 *    see `(req as any).rawBody`), not the re-serialized/parsed JSON, so a
 *    byte-for-byte match with what the sender signed is required.
 *  - The signature is compared with `timingSafeEqual` to avoid timing
 *    side-channels.
 *  - The timestamp must be within FINANCE_WEBHOOK_REPLAY_WINDOW_SECONDS of
 *    "now", and every (signature) is recorded in the WebhookEvent table
 *    with a unique constraint — so even a signature replayed within the
 *    time window a second time is rejected.
 */
@Injectable()
export class FinanceWebhookGuard implements CanActivate {
  private readonly logger = new Logger(FinanceWebhookGuard.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const secret = this.config.get('FINANCE_WEBHOOK_SECRET');
    if (!secret) {
      // Fail closed: never accept unsigned webhooks just because nobody configured a secret.
      throw new ServiceUnavailableException('Finance webhook is not configured on this server.');
    }

    const request = context.switchToHttp().getRequest();
    const signature: string | undefined = request.headers['x-finance-signature'];
    const timestampHeader: string | undefined = request.headers['x-finance-timestamp'];
    const rawBody: Buffer | undefined = request.rawBody;

    if (!signature || !timestampHeader || !rawBody) {
      throw new ForbiddenException('Missing signature, timestamp, or request body.');
    }

    const timestamp = Number(timestampHeader);
    if (!Number.isFinite(timestamp)) {
      throw new ForbiddenException('Invalid timestamp.');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const windowSeconds = this.config.get('FINANCE_WEBHOOK_REPLAY_WINDOW_SECONDS');
    if (Math.abs(nowSeconds - timestamp) > windowSeconds) {
      throw new ForbiddenException('Webhook timestamp outside allowed replay window.');
    }

    const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
    const expected = createHmac('sha256', secret).update(signedPayload).digest('hex');

    const providedBuf = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const isValid = providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);

    if (!isValid) {
      throw new ForbiddenException('Invalid webhook signature.');
    }

    // Idempotency / replay protection: the unique constraint on `signature`
    // makes a second use of the same signature fail here.
    try {
      await this.prisma.webhookEvent.create({
        data: { source: 'finance-receipt', signature, receivedAt: new Date() },
      });
    } catch (err) {
      this.logger.warn('Rejected replayed/duplicate finance webhook signature');
      throw new ForbiddenException('This webhook has already been processed.');
    }

    return true;
  }
}
