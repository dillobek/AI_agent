import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { ExecutionLogService } from '../../common/execution-log.service';
import { AgentToolsService, ToolArgumentError, ToolModuleDisabledError, UnknownToolError } from './agent-tools.service';

/** Which caller triggered a tool call — tags the execution-log actor so voice and text-chat calls can be told apart. */
export type ToolCallSource = 'text' | 'voice';

/**
 * Shared "call a registered tool safely, bound by a timeout, and record it
 * to the execution log" helper.
 *
 * Extracted out of `AgentService.executeToolSafely()` (its original home)
 * so the voice relay endpoint — which calls `AgentToolsService.execute()`
 * directly, bypassing `AgentService`'s reasoning loop entirely, since
 * Gemini Live already decided which tool to call and with what args —
 * gets exactly the same `ExecutionLogService` audit trail, timeout
 * enforcement, and error-shaping the text agent already gets, rather than
 * voice-triggered tool calls silently going unlogged.
 *
 * Never throws: every failure (unknown tool, disabled module, bad args,
 * timeout, or an unexpected error from the tool itself) is caught and
 * turned into a short, safe string — the caller (an LLM feeding it back
 * into a conversation, or a voice session relaying it to Gemini Live)
 * never has to handle a rejected promise here.
 */
@Injectable()
export class ToolExecutionService {
  private readonly logger = new Logger(ToolExecutionService.name);

  constructor(
    private readonly tools: AgentToolsService,
    private readonly executionLog: ExecutionLogService,
    private readonly config: AppConfigService,
  ) {}

  async executeToolSafely(
    name: string,
    args: unknown,
    channelKey: string,
    source: ToolCallSource,
    timeoutMs?: number,
  ): Promise<string> {
    const boundedTimeoutMs = timeoutMs ?? this.config.get('AGENT_TOOL_TIMEOUT_MS');
    const maxOutputChars = this.config.get('AGENT_MAX_TOOL_OUTPUT_CHARS');
    // "ai-agent" is the pre-existing text-chat actor label (Telegram/dashboard/n8n
    // all route through AgentService) — kept unchanged so existing execution-log
    // consumers/filters don't need to change; voice gets its own distinct label.
    const actor = source === 'voice' ? `voice-agent:${channelKey}` : `ai-agent:${channelKey}`;

    try {
      const raw = await this.withTimeout(this.tools.execute(name, args), boundedTimeoutMs);
      const output = raw.length > maxOutputChars ? `${raw.slice(0, maxOutputChars)}… (truncated)` : raw;

      await this.executionLog.record({ actor, toolName: name, input: args, output: { output } });
      return output;
    } catch (err) {
      const safeMessage = this.toSafeToolErrorMessage(name, err);
      await this.executionLog.record({
        actor,
        toolName: name,
        input: args,
        success: false,
        errorMsg: safeMessage,
      });
      return safeMessage;
    }
  }

  /** Converts any tool failure into a message safe to hand back to a caller — never a raw stack trace. */
  private toSafeToolErrorMessage(name: string, err: unknown): string {
    if (err instanceof UnknownToolError) {
      return `Tool "${name}" does not exist and cannot be called.`;
    }
    if (err instanceof ToolModuleDisabledError) {
      return err.message;
    }
    if (err instanceof ToolArgumentError) {
      return `Tool "${name}" was called with invalid arguments: ${err.message}`;
    }
    this.logger.warn(`Tool "${name}" failed: ${(err as Error)?.message ?? err}`);
    return `Tool "${name}" failed to complete. The underlying service may be unavailable — try again shortly.`;
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer!)) as Promise<T>;
  }
}
