import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { FinanceModule } from '../finance/finance.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [FinanceModule, AuthModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
