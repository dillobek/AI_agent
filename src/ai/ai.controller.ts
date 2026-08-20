import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AgentService } from './agent.service';

class PromptDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  prompt: string;
}

@ApiTags('ai-agent')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.USER)
@Controller('ai')
export class AiController {
  constructor(private readonly agentService: AgentService) {}

  @Post('command')
  async runCommand(@Body() dto: PromptDto, @Req() req: Request) {
    const user = req.user as { userId: string };
    const result = await this.agentService.processUserCommand(dto.prompt, `dashboard:${user.userId}`);
    return { result };
  }
}
