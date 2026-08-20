import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { Prisma, TransactionType } from '@prisma/client';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ReceiptWebhookDto } from './dto/receipt-webhook.dto';
import { N8nService } from '../n8n/n8n.service';

/**
 * Finance Engine (Module 4).
 * Parses receipt/invoice payloads (webhooks or Gmail API) and maintains
 * the Income/Expense ledger. Also powers the Gemini tool
 * calculate_finance_summary(startDate, endDate) and the Dashboard's P&L view.
 *
 * Money is stored as Prisma `Decimal` (mapped to SQL `NUMERIC(14,2)`), never
 * `Float` — floating point cannot represent currency exactly and silently
 * accumulates rounding error across many transactions.
 */
@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly n8n: N8nService,
  ) {}

  async createTransaction(dto: CreateTransactionDto) {
    const transaction = await this.prisma.transaction.create({ data: dto });
    void this.n8n.notifyEvent('finance.transaction_ingested', {
      id: transaction.id,
      amount: transaction.amount.toString(),
      type: transaction.type,
      category: transaction.category,
    });
    return transaction;
  }

  /**
   * Ingests an already-authenticated webhook payload. Signature/HMAC/replay
   * verification happens upstream in `FinanceWebhookGuard` — by the time
   * this method runs, the caller has already been proven to hold the
   * shared webhook secret and the request has already been recorded as
   * "seen" for idempotency purposes.
   */
  async ingestReceiptWebhook(dto: ReceiptWebhookDto) {
    const transaction = await this.prisma.transaction.create({
      data: {
        amount: dto.amount,
        type: dto.type as TransactionType,
        category: dto.category,
        description: dto.description,
        date: dto.date ? new Date(dto.date) : new Date(),
      },
    });

    // Best-effort notification for n8n-driven follow-up automations
    // (e.g. Telegram receipt confirmation, monthly report aggregation).
    void this.n8n.notifyEvent('finance.transaction_ingested', {
      id: transaction.id,
      amount: transaction.amount.toString(),
      type: transaction.type,
      category: transaction.category,
    });

    return transaction;
  }

  /**
   * Tool-callable by the Gemini Agent: calculate_finance_summary(startDate, endDate).
   * Also backs the Dashboard's real-time P&L graph (Module 5).
   */
  async calculateFinanceSummary(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error('startDate/endDate must be valid ISO date strings');
    }

    const transactions = await this.prisma.transaction.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
    });

    let income = new Prisma.Decimal(0);
    let expense = new Prisma.Decimal(0);
    const byCategory: Record<string, { income: Prisma.Decimal; expense: Prisma.Decimal }> = {};

    for (const t of transactions) {
      byCategory[t.category] ??= { income: new Prisma.Decimal(0), expense: new Prisma.Decimal(0) };
      if (t.type === TransactionType.INCOME) {
        income = income.add(t.amount);
        byCategory[t.category].income = byCategory[t.category].income.add(t.amount);
      } else {
        expense = expense.add(t.amount);
        byCategory[t.category].expense = byCategory[t.category].expense.add(t.amount);
      }
    }

    const toPlainCategories = Object.fromEntries(
      Object.entries(byCategory).map(([category, v]) => [
        category,
        { income: v.income.toFixed(2), expense: v.expense.toFixed(2) },
      ]),
    );

    return {
      period: { startDate, endDate },
      totalIncome: income.toFixed(2),
      totalExpense: expense.toFixed(2),
      netProfitLoss: income.sub(expense).toFixed(2),
      byCategory: toPlainCategories,
      transactionCount: transactions.length,
    };
  }
}
