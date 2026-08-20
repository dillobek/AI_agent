import { createHmac } from 'crypto';
import { ExecutionContext, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { FinanceWebhookGuard } from './finance-webhook.guard';

const SECRET = 'a-very-real-webhook-secret-value';

function makeConfig(secret = SECRET, replayWindowSeconds = 300) {
  return {
    get: (key: string) => {
      if (key === 'FINANCE_WEBHOOK_SECRET') return secret;
      if (key === 'FINANCE_WEBHOOK_REPLAY_WINDOW_SECONDS') return replayWindowSeconds;
      return undefined;
    },
  } as any;
}

function makeContext(headers: Record<string, string>, rawBody: string): ExecutionContext {
  const request = { headers, rawBody: Buffer.from(rawBody, 'utf8') };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;
}

function sign(timestamp: number, rawBody: string, secret = SECRET) {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

describe('FinanceWebhookGuard', () => {
  const rawBody = JSON.stringify({ amount: 100, type: 'INCOME', category: 'Test' });

  it('fails closed when no secret is configured', async () => {
    const prisma = { webhookEvent: { create: jest.fn() } } as any;
    const guard = new FinanceWebhookGuard(makeConfig(''), prisma);
    const ctx = makeContext({}, rawBody);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects a request with no signature', async () => {
    const prisma = { webhookEvent: { create: jest.fn() } } as any;
    const guard = new FinanceWebhookGuard(makeConfig(), prisma);
    const ctx = makeContext({ 'x-finance-timestamp': `${Math.floor(Date.now() / 1000)}` }, rawBody);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an invalid signature', async () => {
    const prisma = { webhookEvent: { create: jest.fn() } } as any;
    const guard = new FinanceWebhookGuard(makeConfig(), prisma);
    const timestamp = Math.floor(Date.now() / 1000);
    const ctx = makeContext(
      { 'x-finance-signature': 'not-a-real-signature', 'x-finance-timestamp': `${timestamp}` },
      rawBody,
    );
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts a validly signed, fresh request and records it for idempotency', async () => {
    const create = jest.fn().mockResolvedValue({ id: '1' });
    const prisma = { webhookEvent: { create } } as any;
    const guard = new FinanceWebhookGuard(makeConfig(), prisma);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = sign(timestamp, rawBody);
    const ctx = makeContext({ 'x-finance-signature': signature, 'x-finance-timestamp': `${timestamp}` }, rawBody);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ signature }) }),
    );
  });

  it('rejects a request outside the replay window', async () => {
    const prisma = { webhookEvent: { create: jest.fn() } } as any;
    const guard = new FinanceWebhookGuard(makeConfig(SECRET, 60), prisma);
    const oldTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour old
    const signature = sign(oldTimestamp, rawBody);
    const ctx = makeContext({ 'x-finance-signature': signature, 'x-finance-timestamp': `${oldTimestamp}` }, rawBody);

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a replayed (already-seen) signature', async () => {
    // Simulate the unique-constraint violation Prisma would throw on a duplicate signature.
    const create = jest.fn().mockRejectedValue(new Error('Unique constraint failed on the fields: (`signature`)'));
    const prisma = { webhookEvent: { create } } as any;
    const guard = new FinanceWebhookGuard(makeConfig(), prisma);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = sign(timestamp, rawBody);
    const ctx = makeContext({ 'x-finance-signature': signature, 'x-finance-timestamp': `${timestamp}` }, rawBody);

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
