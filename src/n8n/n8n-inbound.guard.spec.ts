import { UnauthorizedException } from '@nestjs/common';
import { N8nInboundGuard } from './n8n-inbound.guard';

function makeConfig(secret: string) {
  return { get: (key: string) => (key === 'N8N_INBOUND_SECRET' ? secret : undefined) } as any;
}

function makeContext(headers: Record<string, string>) {
  return { switchToHttp: () => ({ getRequest: () => ({ headers }) }) } as any;
}

describe('N8nInboundGuard', () => {
  it('rejects when no secret is configured on the server (fail-closed)', () => {
    const guard = new N8nInboundGuard(makeConfig(''));
    expect(() => guard.canActivate(makeContext({ 'x-n8n-secret': 'anything' }))).toThrow(UnauthorizedException);
  });

  it('rejects a request with no secret header', () => {
    const guard = new N8nInboundGuard(makeConfig('a-real-secret-value-1234'));
    expect(() => guard.canActivate(makeContext({}))).toThrow(UnauthorizedException);
  });

  it('rejects an incorrect secret', () => {
    const guard = new N8nInboundGuard(makeConfig('a-real-secret-value-1234'));
    expect(() => guard.canActivate(makeContext({ 'x-n8n-secret': 'wrong-value' }))).toThrow(UnauthorizedException);
  });

  it('accepts the correct secret', () => {
    const guard = new N8nInboundGuard(makeConfig('a-real-secret-value-1234'));
    expect(guard.canActivate(makeContext({ 'x-n8n-secret': 'a-real-secret-value-1234' }))).toBe(true);
  });
});
