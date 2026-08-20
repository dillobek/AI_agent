import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AiController } from './ai.controller';
import { AgentToolsService } from './tools/agent-tools.service';
import { PrismaConversationMemoryStore } from './adapters/prisma-conversation-memory.store';
import { AiProviderModule } from './ai-provider.module';
import { DriveModule } from '../drive/drive.module';
import { FinanceModule } from '../finance/finance.module';
import { PatientsModule } from '../patients/patients.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DriveModule, FinanceModule, PatientsModule, AuthModule, AiProviderModule],
  controllers: [AiController],
  providers: [AgentService, AgentToolsService, PrismaConversationMemoryStore],
  exports: [AgentService],
})
export class AiModule {}
