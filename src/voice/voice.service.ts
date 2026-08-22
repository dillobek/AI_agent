import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { GoogleGenAI, Modality } from '@google/genai';
import { AppConfigService } from '../config/app-config.service';
import { AgentToolsService } from '../ai/tools/agent-tools.service';
import { ToolExecutionService } from '../ai/tools/tool-execution.service';
import { toGeminiFunctionDeclaration } from '../ai/adapters/gemini-tool-mapper.util';
import { AGENT_SYSTEM_PROMPT } from '../ai/system-prompt';
import { ModuleDisabledException } from '../common/exceptions/module-disabled.exception';

export interface LiveTokenResult {
  /** Opaque ephemeral credential — the frontend passes this as `apiKey` when opening its own direct-to-Gemini Live WebSocket (see @google/genai's `ai.live.connect`). Never a reusable API key. */
  token: string;
  /** ISO timestamp — the token (and the messages it can send) stop working after this. */
  expireTime: string;
  model: string;
  /** Safety and behavior instructions applied to the browser-side Live session. */
  systemInstruction: string;
  /** The same tool set the text agent exposes, translated into Gemini's function-declaration shape, so the frontend doesn't need its own copy of the tool registry. */
  tools: ReturnType<typeof toGeminiFunctionDeclaration>[];
}

/**
 * Backs the two voice endpoints (see `VoiceController`):
 *
 * - Minting short-lived Gemini Live ephemeral tokens, so the frontend can
 *   open its own direct browser-to-Gemini WebSocket without ever holding
 *   the real `GEMINI_API_KEY` — a leaked ephemeral token has a small blast
 *   radius (single-session, model-and-modality-locked, expires quickly),
 *   unlike a bare API key.
 * - Relaying Gemini Live's function-call events into
 *   `AgentToolsService.execute()` (via the shared `ToolExecutionService`,
 *   so voice tool calls get the same execution-log audit trail text-agent
 *   calls get), with per-call-id dedupe — Live can retry/duplicate a
 *   function call across a WebSocket reconnect, and some tools have side
 *   effects (creating a `PlanItem`, etc).
 *
 * Deliberately does NOT hold a persistent `GoogleGenAI` client the way
 * `GeminiProviderAdapter` does: token minting is infrequent (once per
 * voice session, not once per message), so a fresh client per call is
 * simpler and sidesteps a stale-key edge case if `GEMINI_API_KEY` were
 * ever rotated without a process restart.
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  // In-memory dedupe cache for Gemini Live function-call ids. A single
  // process is enough here — this is not meant to survive a restart, only
  // to absorb the handful of seconds a WS reconnect might retry a call
  // over, and this app is deployed as a single instance (see README).
  private readonly dedupeCache = new Map<string, { promise: Promise<string>; expiresAt: number }>();
  private readonly DEDUPE_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly config: AppConfigService,
    private readonly tools: AgentToolsService,
    private readonly toolExecution: ToolExecutionService,
  ) {}

  async mintLiveToken(): Promise<LiveTokenResult> {
    if (!this.config.moduleFlags.voice) {
      throw new ModuleDisabledException('voice');
    }
    const apiKey = this.config.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException('GEMINI_API_KEY is not configured.');
    }

    const model = this.config.get('GEMINI_LIVE_MODEL');
    const ttlSeconds = this.config.get('VOICE_LIVE_TOKEN_TTL_SECONDS');
    const expireTime = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    const client = new GoogleGenAI({ apiKey });
    const authToken = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        // Locks the token to this exact model + audio-out session shape —
        // a leaked token can't be repurposed for a different model or a
        // text-only session against our quota.
        liveConnectConstraints: {
          model,
          config: { responseModalities: [Modality.AUDIO] },
        },
      },
    });

    if (!authToken.name) {
      // Should not happen per the API contract, but never hand back an
      // empty/undefined credential silently.
      throw new InternalServerErrorException('Gemini Live token creation returned no token.');
    }

    return {
      token: authToken.name,
      expireTime,
      model,
      systemInstruction: AGENT_SYSTEM_PROMPT,
      tools: this.tools.getAvailableDeclarations().map(toGeminiFunctionDeclaration),
    };
  }

  /**
   * Executes a tool on behalf of a Live session, deduped by Live's own
   * per-call id: a repeat call with the same id (e.g. Live retried it
   * across a reconnect) returns the same in-flight/completed result
   * instead of re-running a possibly side-effecting tool a second time.
   */
  async executeToolWithDedup(toolName: string, args: unknown, channelKey: string, callId: string): Promise<string> {
    this.sweepDedupeCache();

    const cached = this.dedupeCache.get(callId);
    if (cached) {
      this.logger.debug(`Deduping repeated Live function-call id "${callId}" for tool "${toolName}"`);
      return cached.promise;
    }

    const promise = this.toolExecution.executeToolSafely(toolName, args, channelKey, 'voice');
    this.dedupeCache.set(callId, { promise, expiresAt: Date.now() + this.DEDUPE_TTL_MS });
    return promise;
  }

  private sweepDedupeCache() {
    const now = Date.now();
    for (const [key, entry] of this.dedupeCache) {
      if (entry.expiresAt < now) this.dedupeCache.delete(key);
    }
  }
}
