import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AgentService } from './agent.service';
import { AgentToolsService } from './tools/agent-tools.service';

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
  constructor(
    private readonly agentService: AgentService,
    private readonly agentTools: AgentToolsService,
  ) {}

  @Post('command')
  async runCommand(@Body() dto: PromptDto, @Req() req: Request) {
    const user = req.user as { userId: string };
    const result = await this.agentService.processUserCommand(dto.prompt, `dashboard:${user.userId}`);
    return { result };
  }

  /**
   * What the agent can actually do *right now*: the tool registry filtered
   * by which optional modules are enabled, so a deployment without Drive or
   * YouTube doesn't advertise tools that would only fail closed.
   *
   * The dashboard console calls this on mount for its tool count and its
   * suggested-prompt list. Without the route, that request 404s and the
   * console silently reports zero capabilities — which reads as "the agent
   * is dead" even when the command endpoint works fine.
   *
   * Declarations are projected down to name + description deliberately: the
   * full JSON-Schema parameter shape is an internal detail of the
   * model-facing contract and the UI has no use for it.
   */
  @Get('capabilities')
  getCapabilities() {
    const tools = this.agentTools
      .getAvailableDeclarations()
      .map((tool) => ({ name: tool.name, description: tool.description }));
    return { tools };
  }

  /**
   * Clears this user's conversation memory. Scoped to the caller's own
   * `channelKey` — there is deliberately no parameter for someone else's
   * key, so one dashboard user can never wipe another's history.
   *
   * 200 rather than Nest's default 201 for POST: this resets existing
   * state, it doesn't create a resource.
   */
  @HttpCode(200)
  @Post('reset')
  async resetConversation(@Req() req: Request) {
    const user = req.user as { userId: string };
    await this.agentService.resetSession(`dashboard:${user.userId}`);
    return { ok: true };
  }
}
