import { Module } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';
import { FinanceWebhookGuard } from './finance-webhook.guard';
import { AuthModule } from '../auth/auth.module';
import { N8nEventsModule } from '../n8n/n8n-events.module';

@Module({
  imports: [AuthModule, N8nEventsModule],
  controllers: [FinanceController],
  providers: [FinanceService, FinanceWebhookGuard],
  exports: [FinanceService],
})
export class FinanceModule {}
