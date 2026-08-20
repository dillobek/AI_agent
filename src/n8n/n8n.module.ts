import { Module } from '@nestjs/common';
import { N8nService } from './n8n.service';
import { N8nController } from './n8n.controller';
import { N8nInboundGuard } from './n8n-inbound.guard';
import { AiModule } from '../ai/ai.module';
import { FinanceModule } from '../finance/finance.module';
import { PatientsModule } from '../patients/patients.module';

@Module({
  imports: [AiModule, FinanceModule, PatientsModule],
  controllers: [N8nController],
  providers: [N8nService, N8nInboundGuard],
  exports: [N8nService],
})
export class N8nModule {}
