import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../config/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { AuditLogService } from '../common/audit-log.service';

/**
 * Dashboard authentication.
 *
 * Replaces the earlier single shared "access code" with per-user
 * bcrypt-hashed passwords, tied to the same `User`/Telegram-whitelist
 * identity used by the bot. First-run bootstrap: `registerFirstAdmin`
 * only succeeds while the User table is empty, so there is no standing
 * "default admin" credential shipped anywhere in the codebase.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** One-time bootstrap: only works while there are zero users in the database. */
  async registerFirstAdmin(telegramId: string, name: string, password: string) {
    const existingCount = await this.prisma.user.count();
    if (existingCount > 0) {
      throw new ForbiddenException(
        'An admin already exists. Ask an existing admin to create your account instead of using bootstrap registration.',
      );
    }
    if (password.length < 12) {
      throw new BadRequestException('Password must be at least 12 characters.');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.prisma.user.create({
      data: { telegramId: BigInt(telegramId), name, role: 'ADMIN', passwordHash },
    });

    return { id: user.id, name: user.name, role: user.role };
  }

  async login(telegramId: string, password: string, ipAddress: string) {
    await this.assertNotLockedOut(telegramId, ipAddress);

    const user = await this.prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
    const passwordOk = user?.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
    const succeeded = !!user && user.isActive && passwordOk;

    await this.prisma.loginAttempt.create({
      data: { identifier: telegramId, ipAddress, succeeded },
    });

    if (!succeeded) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    await this.prisma.user.update({ where: { id: user!.id }, data: { lastLoginAt: new Date() } });

    const jti = randomUUID();
    const payload = { sub: user!.id, telegramId: user!.telegramId.toString(), role: user!.role, jti };
    const accessToken = await this.jwt.signAsync(payload);

    await this.auditLog.record({
      userId: user!.id,
      actorLabel: `dashboard:${user!.id}`,
      action: 'auth.login',
      ipAddress,
    });

    return { accessToken, user: { id: user!.id, name: user!.name, role: user!.role } };
  }

  async logout(userId: string, jti: string, expiresAt: Date) {
    await this.prisma.revokedToken.upsert({
      where: { jti },
      update: {},
      create: { jti, userId, expiresAt },
    });
    await this.auditLog.record({ userId, actorLabel: `dashboard:${userId}`, action: 'auth.logout' });
  }

  private async assertNotLockedOut(identifier: string, ipAddress: string) {
    const maxAttempts = this.config.get('LOGIN_MAX_ATTEMPTS');
    const lockoutMinutes = this.config.get('LOGIN_LOCKOUT_MINUTES');
    const since = new Date(Date.now() - lockoutMinutes * 60 * 1000);

    const recentFailures = await this.prisma.loginAttempt.count({
      where: { identifier, ipAddress, succeeded: false, createdAt: { gte: since } },
    });

    if (recentFailures >= maxAttempts) {
      throw new UnauthorizedException(
        `Too many failed login attempts. Try again in ${lockoutMinutes} minutes.`,
      );
    }
  }
}
