import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { AgentToolsService } from '../ai/tools/agent-tools.service';
import { ToolExecutionService } from '../ai/tools/tool-execution.service';
import { VOICE_SYSTEM_PROMPT } from '../ai/system-prompt';
import { ModuleDisabledException } from '../common/exceptions/module-disabled.exception';
import { buildRealtimeSession, OpenAiRealtimeTool, toOpenAiRealtimeTool } from './openai-realtime.util';

const OPENAI_REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
/** The SDP exchange is a single fast round trip; slower than this is a stuck connection, not a slow one. */
const SDP_EXCHANGE_TIMEOUT_MS = 20_000;
/** How much of OpenAI's error body to keep in the log — enough to read the validation message, bounded so a huge body can't flood it. */
const MAX_LOGGED_ERROR_CHARS = 1500;

/** Diagnostic view of the session the browser is about to open — see `GET /voice/session`. */
export interface RealtimeSessionDescriptor {
  model: string;
  voice: string;
  language: string;
  instructions: string;
  tools: OpenAiRealtimeTool[];
}

/**
 * Backs the voice endpoints (see `VoiceController`).
 *
 * The browser holds a WebRTC peer connection straight to OpenAI Realtime,
 * so audio never transits this server — but the credential never reaches
 * the browser either. The offer/answer SDP handshake is proxied through
 * here (`createRealtimeCall`), which is the one moment `OPENAI_API_KEY` is
 * used, and it is also where the session's instructions and tool registry
 * get attached. A session created without that tool list can hold a
 * conversation but cannot reach any of this app's data.
 *
 * Tool calls the model then decides to make come back from the browser to
 * `executeToolWithDedup` over the authenticated dashboard JWT, so the
 * browser never holds Drive/Calendar/Finance/DB credentials itself.
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  // In-memory dedupe cache for Realtime function-call ids. A single process
  // is enough here — this is not meant to survive a restart, only to absorb
  // the handful of seconds a reconnect might retry a call over, and this
  // app is deployed as a single instance (see README).
  private readonly dedupeCache = new Map<string, { promise: Promise<string>; expiresAt: number }>();
  private readonly DEDUPE_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly config: AppConfigService,
    private readonly tools: AgentToolsService,
    private readonly toolExecution: ToolExecutionService,
  ) {}

  /**
   * What the browser's session will be configured with, without opening
   * one. Exposed for diagnostics: "is voice on, which model, and does it
   * actually have any tools?" is the first question to ask when the
   * assistant answers but can't do anything.
   */
  describeSession(): RealtimeSessionDescriptor {
    this.assertVoiceEnabled();

    return {
      model: this.config.get('OPENAI_REALTIME_MODEL'),
      voice: this.config.get('OPENAI_REALTIME_VOICE'),
      language: this.config.get('VOICE_LANGUAGE'),
      instructions: VOICE_SYSTEM_PROMPT,
      tools: this.tools.getAvailableDeclarations().map(toOpenAiRealtimeTool),
    };
  }

  /**
   * Exchanges the browser's WebRTC offer for OpenAI's SDP answer, attaching
   * the session configuration (instructions, voice, transcription, tools).
   *
   * Failures map to distinct statuses on purpose. The previous version
   * collapsed all of them into a bare 500, which is what made this
   * undiagnosable from the browser: a missing key, a rejected session
   * field, and an unreachable OpenAI all looked identical. OpenAI's own
   * validation message is passed through because it names the offending
   * field ("Unknown parameter: session.audio.…"), and the caller here is an
   * authenticated admin of this deployment, not the public.
   */
  async createRealtimeCall(offerSdp: string): Promise<string> {
    this.assertVoiceEnabled();
    const apiKey = this.requireApiKey();

    const session = buildRealtimeSession({
      model: this.config.get('OPENAI_REALTIME_MODEL'),
      instructions: VOICE_SYSTEM_PROMPT,
      voice: this.config.get('OPENAI_REALTIME_VOICE'),
      transcriptionModel: this.config.get('OPENAI_TRANSCRIPTION_MODEL'),
      language: this.config.get('VOICE_LANGUAGE'),
      tools: this.tools.getAvailableDeclarations(),
    });

    const form = new FormData();
    form.set('sdp', offerSdp);
    form.set('session', JSON.stringify(session));

    let response: Response;
    try {
      response = await fetch(OPENAI_REALTIME_CALLS_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(SDP_EXCHANGE_TIMEOUT_MS),
      });
    } catch (err) {
      // Network-level failure: DNS, TLS, egress firewall, or our own
      // timeout. Distinct from "OpenAI answered, and said no".
      this.logger.error(`Could not reach OpenAI Realtime: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        "Could not reach OpenAI Realtime. Check the server's outbound network access and try again.",
      );
    }

    const body = await response.text();

    if (!response.ok) {
      this.logger.error(
        `OpenAI Realtime rejected the session (HTTP ${response.status}): ${body.slice(0, MAX_LOGGED_ERROR_CHARS)}`,
      );
      const message = this.extractErrorMessage(body);
      if (response.status === 429 && this.isInsufficientQuota(body)) {
        throw new HttpException(
          "OpenAI balans tugagan. Jarvisdan foydalanish uchun Billing bo'limida API kreditini to'ldiring.",
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      throw new BadGatewayException(`OpenAI Realtime rejected the session (HTTP ${response.status}): ${message}`);
    }

    // A 200 with a non-SDP body is a real, observed failure mode. Catching
    // it here turns "the call connects and then nothing ever happens" into
    // a clear error at the moment it goes wrong.
    if (!body.trimStart().startsWith('v=')) {
      this.logger.error(`OpenAI Realtime returned a non-SDP body: ${body.slice(0, MAX_LOGGED_ERROR_CHARS)}`);
      throw new BadGatewayException('OpenAI Realtime returned an unexpected response instead of an SDP answer.');
    }

    this.logger.log(`Realtime session opened with ${(session.tools as unknown[]).length} tool(s) attached`);
    return body;
  }

  /**
   * Executes a tool on behalf of a Realtime session, deduped by the API's
   * own per-call id: a repeat call with the same id (e.g. retried across a
   * reconnect) returns the same in-flight/completed result instead of
   * re-running a possibly side-effecting tool a second time.
   */
  async executeToolWithDedup(toolName: string, args: unknown, channelKey: string, callId: string): Promise<string> {
    this.sweepDedupeCache();

    const cached = this.dedupeCache.get(callId);
    if (cached) {
      this.logger.debug(`Deduping repeated Realtime function-call id "${callId}" for tool "${toolName}"`);
      return cached.promise;
    }

    const promise = this.toolExecution.executeToolSafely(toolName, args, channelKey, 'voice');
    this.dedupeCache.set(callId, { promise, expiresAt: Date.now() + this.DEDUPE_TTL_MS });
    return promise;
  }

  private assertVoiceEnabled(): void {
    if (!this.config.moduleFlags.voice) {
      throw new ModuleDisabledException('voice');
    }
  }

  private requireApiKey(): string {
    const apiKey = this.config.get('OPENAI_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException(
        'OPENAI_API_KEY is not set on the server, so no voice session can be opened.',
      );
    }
    return apiKey;
  }

  /** Pulls `error.message` out of OpenAI's JSON error envelope, falling back to the raw body. */
  private extractErrorMessage(body: string): string {
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      if (parsed.error?.message) return parsed.error.message;
    } catch {
      // Not JSON — fall through to the raw text.
    }
    return body.slice(0, 300) || 'no response body';
  }

  private isInsufficientQuota(body: string): boolean {
    try {
      const parsed = JSON.parse(body) as { error?: { code?: string; type?: string; message?: string } };
      const error = parsed.error;
      return error?.code === 'insufficient_quota' || error?.type === 'insufficient_quota' || /insufficient quota|billing/i.test(error?.message ?? '');
    } catch {
      return /insufficient_quota|insufficient quota|billing/i.test(body);
    }
  }

  private sweepDedupeCache() {
    const now = Date.now();
    for (const [key, entry] of this.dedupeCache) {
      if (entry.expiresAt < now) this.dedupeCache.delete(key);
    }
  }
}
