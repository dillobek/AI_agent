import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { N8nInboundGuard } from './n8n-inbound.guard';
import { N8nTriggerDto } from './dto/n8n-trigger.dto';
import { AgentService } from '../ai/agent.service';
import { FinanceService } from '../finance/finance.service';
import { PatientsService } from '../patients/patients.service';
import { PlanService } from '../plan/plan.service';
import { ExecutionLogService } from '../common/execution-log.service';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '../common/guards/module-enabled.guard';

/**
 * Inbound integration point for n8n workflows (Overview / cross-system
 * automation). Every request MUST carry the shared secret validated by
 * N8nInboundGuard, and can only invoke the small, explicit action set
 * defined in N8nTriggerDto — never arbitrary code, shell commands, or
 * filesystem access. `ModuleEnabledGuard` runs first so a disabled n8n
 * integration returns a clean 503 instead of evaluating the secret.
 */
@ApiTags('n8n')
@RequireModule('n8n')
@UseGuards(ModuleEnabledGuard, N8nInboundGuard)
@Controller('n8n')
export class N8nController {
  constructor(
    private readonly agentService: AgentService,
    private readonly financeService: FinanceService,
    private readonly patientsService: PatientsService,
    private readonly planService: PlanService,
    private readonly executionLog: ExecutionLogService,
  ) {}

  @Post('trigger')
  async trigger(@Body() dto: N8nTriggerDto) {
    const payload = dto.payload ?? {};
    let result: unknown;

    switch (dto.action) {
      case 'agent_prompt': {
        const prompt = payload.prompt as string | undefined;
        if (!prompt) throw new BadRequestException('payload.prompt is required for agent_prompt');
        result = await this.agentService.processUserCommand(prompt, `n8n:${dto.requestId ?? 'anonymous'}`);
        break;
      }
      case 'finance_summary': {
        const { startDate, endDate } = payload as { startDate?: string; endDate?: string };
        if (!startDate || !endDate) {
          throw new BadRequestException('payload.startDate and payload.endDate are required');
        }
        result = await this.financeService.calculateFinanceSummary(startDate, endDate);
        break;
      }
      case 'patient_history': {
        const personName = payload.personName as string | undefined;
        if (!personName) throw new BadRequestException('payload.personName is required');
        result = await this.patientsService.getPatientPrescriptions(personName);
        break;
      }
      case 'get_today_plan': {
        result = await this.planService.renderTodayPlan();
        break;
      }
      default:
        throw new BadRequestException(`Unsupported action: ${dto.action}`);
    }

    await this.executionLog.record({
      actor: 'n8n-inbound',
      toolName: dto.action,
      input: payload,
      output: { result },
    });

    return { action: dto.action, requestId: dto.requestId, result };
  }
}
