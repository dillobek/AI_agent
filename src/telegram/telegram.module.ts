import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import { TelegramUpdate } from './telegram.update';
import { TelegramWhitelistGuard } from './telegram-whitelist.guard';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        token: config.get<string>('TELEGRAM_BOT_TOKEN', ''),
      }),
    }),
    AiModule,
  ],
  providers: [TelegramUpdate, TelegramWhitelistGuard],
})
export class TelegramModule {}
