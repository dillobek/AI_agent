import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '../common/guards/module-enabled.guard';
import { ExecutionLogService } from '../common/execution-log.service';
import { AuditLogService } from '../common/audit-log.service';
import { FinanceService } from '../finance/finance.service';
import { PrismaService } from '../config/prisma.service';

/**
 * Web Dashboard API (Module 5).
 * Backs: real-time financial P&L graphs, patient record finder/preview,
 * and the system execution logs / AI tool-calling activity monitor.
 *
 * `/dashboard/logs` and `/dashboard/audit` are ADMIN-only — execution logs
 * and the audit trail are sensitive operational data, not something every
 * authenticated USER should be able to browse.
 */
@ApiTags('dashboard')
@ApiBearerAuth()
@RequireModule('dashboard')
@UseGuards(ModuleEnabledGuard, JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly executionLog: ExecutionLogService,
    private readonly auditLog: AuditLogService,
    private readonly financeService: FinanceService,
    private readonly prisma: PrismaService,
  ) {}

  @Roles(Role.ADMIN)
  @Get('logs')
  logs(@Query('limit') limit?: string) {
    return this.executionLog.recent(limit ? Math.min(parseInt(limit, 10) || 50, 500) : 50);
  }

  @Roles(Role.ADMIN)
  @Get('audit')
  audit(@Query('limit') limit?: string) {
    return this.auditLog.recent(limit ? Math.min(parseInt(limit, 10) || 100, 500) : 100);
  }

  @Roles(Role.ADMIN, Role.USER)
  @Get('pnl')
  pnl(@Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return this.financeService.calculateFinanceSummary(startDate, endDate);
  }

  @Roles(Role.ADMIN, Role.USER)
  @Get('overview')
  async overview() {
    const [patientCount, prescriptionCount, transactionCount] = await Promise.all([
      this.prisma.patient.count(),
      this.prisma.prescription.count(),
      this.prisma.transaction.count(),
    ]);

    return { patientCount, prescriptionCount, transactionCount };
  }
}
