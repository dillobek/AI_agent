import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AiController } from './ai.controller';
import { AgentToolsService } from './tools/agent-tools.service';
import { ToolExecutionService } from './tools/tool-execution.service';
import { PrismaConversationMemoryStore } from './adapters/prisma-conversation-memory.store';
import { AiProviderModule } from './ai-provider.module';
import { DriveModule } from '../drive/drive.module';
import { FinanceModule } from '../finance/finance.module';
import { PatientsModule } from '../patients/patients.module';
import { ObsidianModule } from '../obsidian/obsidian.module';
import { YoutubeModule } from '../youtube/youtube.module';
import { PlanModule } from '../plan/plan.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DriveModule, FinanceModule, PatientsModule, ObsidianModule, YoutubeModule, PlanModule, AuthModule, AiProviderModule],
  controllers: [AiController],
  providers: [AgentService, AgentToolsService, ToolExecutionService, PrismaConversationMemoryStore],
  // AgentToolsService/ToolExecutionService are also consumed directly by
  // VoiceModule (the Gemini Live relay bypasses AgentService's reasoning
  // loop — Live already decided which tool to call) and by N8nModule.
  exports: [AgentService, AgentToolsService, ToolExecutionService],
})
export class AiModule {}
