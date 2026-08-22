import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '../common/guards/module-enabled.guard';
import { AuditLogService } from '../common/audit-log.service';
import { N8nService } from '../n8n/n8n.service';
import { VoiceService } from './voice.service';
import { ExecuteVoiceToolDto } from './dto/execute-voice-tool.dto';
import { CreateRealtimeCallDto } from './dto/create-realtime-call.dto';

/** Tool calls that pull today's report/plan data — worth a distinct n8n signal from generic tool activity. */
const REPORT_TOOL_NAMES = new Set(['get_today_report', 'get_today_plan']);

/**
 * Real-time voice assistant ("Ali") backend surface. The conversation
 * itself runs as a WebRTC peer connection between the browser and OpenAI
 * Realtime, so audio never passes through here. This controller only:
 *
 * 1. proxies the one-shot SDP handshake that opens that connection, which
 *    is where `OPENAI_API_KEY` and the agent's tool registry are attached
 *    (the browser gets neither), and
 * 2. executes the tool calls the model decides to make, since the browser
 *    must never hold Drive/Calendar/Finance/DB credentials itself.
 *
 * `ModuleEnabledGuard` runs before auth (guard order matters — see that
 * guard's own doc comment), so a deployment with VOICE_ENABLED=false
 * returns a clean 503 regardless of whether the caller is authenticated.
 */
@ApiTags('voice')
@ApiBearerAuth()
@RequireModule('voice')
@UseGuards(ModuleEnabledGuard, JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.USER)
@Controller('voice')
export class VoiceController {
  constructor(
    private readonly voiceService: VoiceService,
    private readonly auditLog: AuditLogService,
    private readonly n8n: N8nService,
  ) {}

  /**
   * Read-only view of how a voice session will be configured — model,
   * voice, language, and above all how many tools are attached. When the
   * assistant talks but can't act, an empty `tools` array here is the
   * answer, and it can be checked without spending a session.
   */
  @Get('session')
  describeSession() {
    const { instructions, ...session } = this.voiceService.describeSession();
    return { ...session, instructionsChars: instructions.length, toolCount: session.tools.length };
  }

  /**
   * Opens a Realtime session by exchanging the browser's WebRTC offer for
   * OpenAI's SDP answer. This is the call that actually starts a
   * conversation, so it carries the audit-log entry and the n8n event —
   * both were previously attached to a token endpoint the WebRTC frontend
   * never calls, which left real sessions unlogged.
   *
   * Rate-limited above login's 10/60s: reconnects and page reloads
   * legitimately re-open a session several times in a row.
   */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('realtime-call')
  async createRealtimeCall(@Body() dto: CreateRealtimeCallDto, @Req() req: Request) {
    const user = req.user as { userId: string };
    const answerSdp = await this.voiceService.createRealtimeCall(dto.offerSdp);

    await this.auditLog.record({
      userId: user.userId,
      actorLabel: `dashboard:${user.userId}`,
      action: 'voice.session_started',
      ipAddress: req.ip ?? 'unknown',
    });
    await this.n8n.notifyEvent('voice.session_started', { userId: user.userId });

    return { answerSdp };
  }

  /**
   * Relays one model-initiated function call into
   * `AgentToolsService.execute()` (via `ToolExecutionService`, for the
   * shared logging/timeout/error-shaping — see VoiceService). Deliberately
   * does NOT re-enter AgentService's reasoning loop: the Realtime model
   * already decided which tool to call and with what args, so doing that
   * again here would risk double-dispatch / conflicting conversation state.
   *
   * Rate-limited well above login's threshold — a single spoken turn can
   * trigger several function calls in quick succession.
   */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  @Post('execute-tool')
  async executeTool(@Body() dto: ExecuteVoiceToolDto, @Req() req: Request) {
    const user = req.user as { userId: string };
    const channelKey = `dashboard:${user.userId}`;

    const result = await this.voiceService.executeToolWithDedup(dto.toolName, dto.args ?? {}, channelKey, dto.callId);

    if (REPORT_TOOL_NAMES.has(dto.toolName)) {
      await this.n8n.notifyEvent('voice.report_requested', { userId: user.userId, toolName: dto.toolName });
    }

    return { callId: dto.callId, result };
  }
}
