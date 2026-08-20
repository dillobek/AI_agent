import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { AppConfigService } from '../config/app-config.service';

/**
 * Guards the inbound n8n -> NestJS trigger endpoint.
 * n8n must send the shared secret (N8N_INBOUND_SECRET) in the
 * "x-n8n-secret" header on every request. Compared with a constant-time
 * comparison to avoid timing attacks. Requests are rejected outright if
 * the secret is not configured, so the endpoint can never be left open
 * by accident.
 */
@Injectable()
export class N8nInboundGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get('N8N_INBOUND_SECRET');
    if (!expected) {
      throw new UnauthorizedException('n8n inbound secret is not configured on the server');
    }

    const request = context.switchToHttp().getRequest();
    const provided: string | undefined = request.headers['x-n8n-secret'];
    if (!provided) {
      throw new UnauthorizedException('Missing x-n8n-secret header');
    }

    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(provided);
    const isValid =
      expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);

    if (!isValid) {
      throw new UnauthorizedException('Invalid x-n8n-secret');
    }
    return true;
  }
}
