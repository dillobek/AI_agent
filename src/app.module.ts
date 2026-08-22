import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppConfigModule } from './config/app-config.module';
import { AppConfigService } from './config/app-config.service';
import { PrismaModule } from './config/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { TelegramModule } from './telegram/telegram.module';
import { DriveModule } from './drive/drive.module';
import { ObsidianModule } from './obsidian/obsidian.module';
import { RagModule } from './rag/rag.module';
import { AiModule } from './ai/ai.module';
import { FinanceModule } from './finance/finance.module';
import { PatientsModule } from './patients/patients.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { N8nModule } from './n8n/n8n.module';
import { AutonomyModule } from './autonomy/autonomy.module';
import { YoutubeModule } from './youtube/youtube.module';
import { CalendarModule } from './calendar/calendar.module';
import { PlanModule } from './plan/plan.module';
import { VoiceModule } from './voice/voice.module';
import { readModuleFlagsFromEnv } from './config/module-flags.util';
import { HttpThrottlerGuard } from './common/guards/http-throttler.guard';

// Read once, at module-graph construction time (see module-flags.util.ts for why).
const flags = readModuleFlagsFromEnv();

@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [
          {
            ttl: config.get('RATE_LIMIT_TTL_SECONDS') * 1000,
            limit: config.get('RATE_LIMIT_MAX'),
          },
        ],
      }),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,
    AuthModule,
    // Drive/Obsidian/Rag/Finance/Patients stay structurally registered even
    // when their flag is off, because AiModule/N8nModule/PatientsModule
    // depend on them for DI wiring — each service/controller enforces its
    // own flag check at call time (ModuleDisabledException) instead.
    RagModule,
    DriveModule,
    ObsidianModule,
    FinanceModule,
    PatientsModule,
    YoutubeModule,
    CalendarModule,
    PlanModule,
    AiModule,
    VoiceModule,
    DashboardModule,
    N8nModule,
    AutonomyModule,
    // Telegram is a true leaf module (nothing else depends on it) and
    // starting Telegraf with no/invalid token would throw, so it is only
    // added to the graph at all when explicitly enabled.
    ...(flags.telegram ? [TelegramModule] : []),
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: HttpThrottlerGuard,
    },
  ],
})
export class AppModule {}
