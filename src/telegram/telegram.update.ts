import { UseGuards } from '@nestjs/common';
import { Ctx, Start, Update, On, Command } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { TelegramWhitelistGuard } from './telegram-whitelist.guard';
import { AgentService } from '../ai/agent.service';
import { AppConfigService } from '../config/app-config.service';
import { randomizedDelay } from '../common/utils/delay.util';
import { ExecutionLogService } from '../common/execution-log.service';

/**
 * Telegram Bot Interface (Module - Overview #1).
 * Handles commands, natural-language messages (routed through the Gemini
 * Agent for tool calling), and notifications.
 *
 * Every handler's conversation memory key is `telegram:<their numeric id>`
 * — combined with `TelegramWhitelistGuard` rejecting any update from an
 * id outside `TELEGRAM_WHITELIST_IDS`, one Telegram user can never read or
 * influence another user's agent conversation history.
 */
@Update()
@UseGuards(TelegramWhitelistGuard)
export class TelegramUpdate {
  constructor(
    private readonly agentService: AgentService,
    private readonly executionLog: ExecutionLogService,
    private readonly config: AppConfigService,
  ) {}

  @Start()
  async onStart(@Ctx() ctx: Context) {
    await this.delay();
    await ctx.reply(
      '🤖 AI Personal Assistant online.\n\n' +
        'Available commands:\n' +
        '/find <person name> - Find the latest Drive document for a patient\n' +
        '/prescriptions <person name> - Get prescription history\n' +
        '/finance <start> <end> - Finance P&L summary\n' +
        '/reset - Clear this conversation\'s memory\n\n' +
        'You can also just message me naturally and I will route it to the AI agent.',
    );
  }

  @Command('reset')
  async onReset(@Ctx() ctx: Context) {
    await this.agentService.resetSession(this.channelKey(ctx));
    await ctx.reply('Conversation memory cleared.');
  }

  @Command('find')
  async onFind(@Ctx() ctx: Context) {
    const text = (ctx.message as any)?.text ?? '';
    const personName = text.replace(/^\/find\s*/i, '').trim();
    await this.handlePrompt(ctx, `Find the latest document for ${personName}`);
  }

  @Command('prescriptions')
  async onPrescriptions(@Ctx() ctx: Context) {
    const text = (ctx.message as any)?.text ?? '';
    const personName = text.replace(/^\/prescriptions\s*/i, '').trim();
    await this.handlePrompt(ctx, `Get prescription history for ${personName}`);
  }

  @Command('finance')
  async onFinance(@Ctx() ctx: Context) {
    const text = (ctx.message as any)?.text ?? '';
    const [start, end] = text.replace(/^\/finance\s*/i, '').trim().split(/\s+/);
    await this.handlePrompt(ctx, `Calculate finance summary from ${start} to ${end}`);
  }

  @On('text')
  async onText(@Ctx() ctx: Context) {
    const text = (ctx.message as any)?.text ?? '';
    if (text.startsWith('/')) return; // already handled by @Command
    await this.handlePrompt(ctx, text);
  }

  private channelKey(ctx: Context): string {
    return `telegram:${ctx.from?.id}`;
  }

  private async delay() {
    await randomizedDelay(this.config.get('API_CALL_DELAY_MIN_MS'), this.config.get('API_CALL_DELAY_MAX_MS'));
  }

  private async handlePrompt(ctx: Context, prompt: string) {
    await this.delay(); // anti rate-limit
    await ctx.sendChatAction('typing');
    const channelKey = this.channelKey(ctx);
    try {
      const result = await this.agentService.processUserCommand(prompt, channelKey);
      await this.delay();
      await ctx.reply(result ?? 'No response from AI engine.');
    } catch (err) {
      await this.executionLog.record({
        actor: channelKey,
        input: { prompt },
        success: false,
        errorMsg: (err as Error).message,
      });
      await ctx.reply('⚠️ Something went wrong processing your request. Please try again shortly.');
    }
  }
}
