import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { TelegrafExecutionContext } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { AppConfigService } from '../config/app-config.service';

/**
 * Telegram Whitelist Guard (Module 1).
 * Restricts every bot command/update strictly to authorized Telegram user_ids
 * configured via TELEGRAM_WHITELIST_IDS. This — combined with the agent's
 * per-channel conversation memory keyed on the Telegram user id — is what
 * guarantees one Telegram user can never see or influence another's
 * conversation.
 */
@Injectable()
export class TelegramWhitelistGuard implements CanActivate {
  private readonly logger = new Logger(TelegramWhitelistGuard.name);
  private readonly whitelist: Set<string>;

  constructor(private readonly config: AppConfigService) {
    const raw = this.config.get('TELEGRAM_WHITELIST_IDS');
    this.whitelist = new Set(
      raw
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const ctx = TelegrafExecutionContext.create(context);
    const telegramCtx = ctx.getContext<Context>();
    const userId = telegramCtx.from?.id?.toString();

    if (!userId || !this.whitelist.has(userId)) {
      this.logger.warn(`Blocked unauthorized Telegram user: ${userId ?? 'unknown'}`);
      telegramCtx.reply('⛔ You are not authorized to use this assistant.').catch(() => undefined);
      return false;
    }
    return true;
  }
}
