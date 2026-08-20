import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../config/prisma.service';
import { AppEnv } from '../config/env.schema';

interface JwtPayload {
  sub: string;
  telegramId: string;
  role: string;
  jti: string;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<AppEnv, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    });
  }

  /**
   * Runs on every authenticated request. Beyond verifying the signature
   * (handled by passport-jwt before this runs), we re-check the database:
   * the user must still exist and be active, and the token's `jti` must
   * not have been revoked (logout) — otherwise a disabled user or a
   * logged-out session token would keep working until natural expiry.
   */
  async validate(payload: JwtPayload) {
    const revoked = await this.prisma.revokedToken.findUnique({ where: { jti: payload.jti } });
    if (revoked) {
      throw new UnauthorizedException('This session has been logged out.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account is inactive or no longer exists.');
    }

    return { userId: user.id, telegramId: user.telegramId.toString(), role: user.role, jti: payload.jti, exp: payload.exp };
  }
}
