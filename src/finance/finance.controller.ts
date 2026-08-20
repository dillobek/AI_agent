import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '../common/guards/module-enabled.guard';
import { FinanceService } from './finance.service';
import { FinanceWebhookGuard } from './finance-webhook.guard';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ReceiptWebhookDto } from './dto/receipt-webhook.dto';

@ApiTags('finance')
@RequireModule('finance')
@UseGuards(ModuleEnabledGuard)
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @Post('transactions')
  create(@Body() dto: CreateTransactionDto) {
    return this.financeService.createTransaction(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.USER)
  @ApiBearerAuth()
  @Get('summary')
  summary(@Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return this.financeService.calculateFinanceSummary(startDate, endDate);
  }

  /**
   * Webhook endpoint for receipt/invoice ingestion. Protected entirely by
   * `FinanceWebhookGuard` (HMAC signature over the raw body + replay
   * protection) rather than JWT — the caller here is an external system
   * (Gmail parser, payment provider, n8n), not a dashboard user.
   */
  @UseGuards(FinanceWebhookGuard)
  @Post('webhook/receipt')
  receiptWebhook(@Body() dto: ReceiptWebhookDto) {
    return this.financeService.ingestReceiptWebhook(dto);
  }
}
