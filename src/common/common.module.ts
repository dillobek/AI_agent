import { Global, Module } from '@nestjs/common';
import { ExecutionLogService } from './execution-log.service';
import { AuditLogService } from './audit-log.service';
import { CleanupService } from './cleanup.service';
import { ModuleEnabledGuard } from './guards/module-enabled.guard';

@Global()
@Module({
  providers: [ExecutionLogService, AuditLogService, CleanupService, ModuleEnabledGuard],
  exports: [ExecutionLogService, AuditLogService, ModuleEnabledGuard],
})
export class CommonModule {}
