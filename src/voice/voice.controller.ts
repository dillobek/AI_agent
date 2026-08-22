import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
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

/** Tool calls that pull today's report/plan data — worth a distinct n8n signal from generic tool activity. */
const REPORT_TOOL_NAMES = new Set(['get_today_report', 'get_today_plan']);

/**
 * Real-time voice assistant ("Salom Ali") backend surface — the Gemini
 * Live session itself runs entirely in the browser (frontend connects
 * directly to Gemini over its own WebSocket, see M6), this controller only
 * (1) mints the short-lived credential that connection uses, and (2)
 * executes the tool calls Live decides to make, since the browser must
 * never hold Drive/Calendar/Finance/DB credentials itself.
 *
 * `ModuleEnabledGuard` runs before auth (guard order matters — see
 * ModuleEnabledGuard's own doc comment), so a deployment with
 * VOICE_ENABLED=false returns a clean 503 regardless of whether the
 * caller is authenticated.
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
   * Mints a fresh ephemeral token. Called once to start a voice session,
   * and again by the frontend ahead of token expiry / on WS reconnect —
   * so the limit is well above login's 10/60s (a single voice session can
   * legitimately re-mint a few times), while still bounding a
   * misbehaving/compromised client. Audit-logged like login: minting a
   * credential — even a short-lived one — is security-relevant.
   */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('live-token')
  async mintLiveToken(@Req() req: Request) {
    const user = req.user as { userId: string };
    const result = await this.voiceService.mintLiveToken();

    await this.auditLog.record({
      userId: user.userId,
      actorLabel: `dashboard:${user.userId}`,
      action: 'voice.live_token_minted',
      ipAddress: req.ip ?? 'unknown',
    });
    await this.n8n.notifyEvent('voice.session_started', { userId: user.userId });

    return result;
  }

  /** Exchanges a browser WebRTC offer for OpenAI Realtime's SDP answer. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('realtime-call')
  async createRealtimeCall(@Body('offerSdp') offerSdp: string) {
    if (!offerSdp) throw new Error('offerSdp is required');
    return { answerSdp: await this.voiceService.createRealtimeCall(offerSdp) };
  }

  /**
   * Relays one Gemini-Live-initiated function call into
   * `AgentToolsService.execute()` (via `ToolExecutionService`, for the
   * shared logging/timeout/error-shaping — see VoiceService). Deliberately
   * does NOT re-enter AgentService's reasoning loop: Live already decided
   * which tool to call and with what args, so doing that again here would
   * risk double-dispatch / conflicting conversation state.
   *
   * Rate-limited well above login's threshold — a single spoken turn can
   * trigger several function calls in quick succession.
   */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
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
