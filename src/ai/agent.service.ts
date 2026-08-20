import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { ExecutionLogService } from '../common/execution-log.service';
import { randomizedDelay } from '../common/utils/delay.util';
import { AI_PROVIDER_ADAPTER, AiProviderAdapter, ConversationTurn } from './adapters/ai-provider.adapter';
import { PrismaConversationMemoryStore } from './adapters/prisma-conversation-memory.store';
import { AgentToolsService, ToolArgumentError, ToolModuleDisabledError, UnknownToolError } from './tools/agent-tools.service';
import { AGENT_SYSTEM_PROMPT } from './system-prompt';

/**
 * The AI Engine's orchestration loop (Module 3), rewritten from a
 * one-shot "route to a single tool" pattern into a real, bounded
 * multi-step tool-calling loop:
 *
 *   system instruction -> user message -> model picks tool(s) -> validate
 *   args -> execute -> feed result back to the model as a function
 *   response -> model picks the next tool OR gives a final answer ->
 *   repeat, up to AGENT_MAX_TOOL_CALLS steps -> stop safely.
 *
 * Conversation memory is loaded/saved per `channelKey` (see
 * `PrismaConversationMemoryStore`), which is the isolation boundary: a
 * Telegram user's key is `telegram:<their id>`, so there is no code path
 * by which one Telegram user's history could be read using another's key.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    @Inject(AI_PROVIDER_ADAPTER) private readonly aiProvider: AiProviderAdapter,
    private readonly tools: AgentToolsService,
    private readonly memory: PrismaConversationMemoryStore,
    private readonly config: AppConfigService,
    private readonly executionLog: ExecutionLogService,
  ) {}

  /**
   * @param prompt The user's message.
   * @param channelKey Isolation key for conversation memory, e.g. `telegram:123456789`, `dashboard:<userId>`, `n8n:<requestId>`.
   */
  async processUserCommand(prompt: string, channelKey = 'anonymous'): Promise<string> {
    const maxPromptChars = this.config.get('AGENT_MAX_PROMPT_CHARS');
    if (prompt.length > maxPromptChars) {
      return `Your message is too long (${prompt.length} chars, max ${maxPromptChars}). Please shorten it and try again.`;
    }

    const maxSteps = this.config.get('AGENT_MAX_TOOL_CALLS');
    const perCallTimeoutMs = this.config.get('AGENT_TOOL_TIMEOUT_MS');
    const overallTimeoutMs = perCallTimeoutMs * (maxSteps + 2);

    const run = this.runLoop(prompt, channelKey, maxSteps, perCallTimeoutMs);

    try {
      return await this.withTimeout(run, overallTimeoutMs);
    } catch (err) {
      this.logger.error(`Agent loop failed for channel ${channelKey}: ${(err as Error).message}`);
      return "I wasn't able to complete that request in time. Please try again, or simplify your request.";
    }
  }

  /** Clears a channel's conversation memory — used by /reset-style commands and tests. */
  async resetSession(channelKey: string): Promise<void> {
    await this.memory.clear(channelKey);
  }

  private async runLoop(prompt: string, channelKey: string, maxSteps: number, perCallTimeoutMs: number): Promise<string> {
    const history = await this.memory.load(channelKey);
    const turns: ConversationTurn[] = [...history, { role: 'user', text: prompt }];
    const availableTools = this.tools.getAvailableDeclarations();

    let finalText: string | undefined;
    let stepsTaken = 0;

    for (let step = 0; step < maxSteps; step++) {
      stepsTaken = step + 1;
      await randomizedDelay(
        this.config.get('API_CALL_DELAY_MIN_MS'),
        this.config.get('API_CALL_DELAY_MAX_MS'),
      );

      const result = await this.aiProvider.generate({
        systemInstruction: AGENT_SYSTEM_PROMPT,
        history: turns,
        tools: availableTools,
        timeoutMs: perCallTimeoutMs,
      });

      if (result.text !== undefined) {
        finalText = result.text;
        turns.push({ role: 'model', text: result.text });
        break;
      }

      if (!result.toolCalls || result.toolCalls.length === 0) {
        finalText = 'I was not able to determine a next step for that request.';
        break;
      }

      turns.push({ role: 'model', toolCalls: result.toolCalls });

      // Multiple tool calls in one round are executed concurrently, each
      // independently bounded by perCallTimeoutMs.
      const toolResults = await Promise.all(
        result.toolCalls.map((call) => this.executeToolSafely(call.name, call.args, perCallTimeoutMs, channelKey)),
      );

      for (let i = 0; i < result.toolCalls.length; i++) {
        turns.push({
          role: 'tool',
          toolName: result.toolCalls[i].name,
          toolCallId: result.toolCalls[i].id,
          text: toolResults[i],
        });
      }
    }

    if (finalText === undefined) {
      finalText =
        "I've reached the maximum number of steps I'm allowed to take on this request without a final answer. " +
        'Please try rephrasing, or break your request into smaller parts.';
      turns.push({ role: 'model', text: finalText });
    }

    await this.memory.save(channelKey, turns);
    this.logger.debug(`Agent loop for ${channelKey} completed in ${stepsTaken} step(s)`);
    return finalText;
  }

  private async executeToolSafely(
    name: string,
    args: unknown,
    timeoutMs: number,
    channelKey: string,
  ): Promise<string> {
    const maxOutputChars = this.config.get('AGENT_MAX_TOOL_OUTPUT_CHARS');

    try {
      const raw = await this.withTimeout(this.tools.execute(name, args), timeoutMs);
      const output = raw.length > maxOutputChars ? `${raw.slice(0, maxOutputChars)}… (truncated)` : raw;

      await this.executionLog.record({ actor: `ai-agent:${channelKey}`, toolName: name, input: args, output: { output } });
      return output;
    } catch (err) {
      const safeMessage = this.toSafeToolErrorMessage(name, err);
      await this.executionLog.record({
        actor: `ai-agent:${channelKey}`,
        toolName: name,
        input: args,
        success: false,
        errorMsg: safeMessage,
      });
      return safeMessage;
    }
  }

  /** Converts any tool failure into a message safe to feed back to the model — never a raw stack trace. */
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
