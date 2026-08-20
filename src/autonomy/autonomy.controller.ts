import { Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PersonalAssistantService } from './personal-assistant.service';

@ApiTags('personal-automation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('personal-automation')
export class AutonomyController {
  constructor(private readonly assistant: PersonalAssistantService) {}

  @Roles(Role.ADMIN)
  @Get('status')
  status() { return this.assistant.status(); }

  @Roles(Role.ADMIN)
  @Patch('pause')
  async pause() { await this.assistant.setPaused(true); return this.assistant.status(); }

  @Roles(Role.ADMIN)
  @Patch('resume')
  async resume() { await this.assistant.setPaused(false); return this.assistant.status(); }
}
