import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RegisterAdminDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** One-time bootstrap endpoint — only succeeds while the User table is empty. */
  @Post('register-admin')
  registerFirstAdmin(@Body() dto: RegisterAdminDto) {
    return this.authService.registerFirstAdmin(dto.telegramId, dto.name, dto.password);
  }

  // Stricter than the global rate limit — login is the highest-value target for brute force.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto.telegramId, dto.password, req.ip ?? 'unknown');
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('logout')
  async logout(@Req() req: Request) {
    const user = req.user as { userId: string; jti: string; exp: number };
    await this.authService.logout(user.userId, user.jti, new Date(user.exp * 1000));
    return { ok: true };
  }
}
