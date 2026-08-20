import { BadRequestException, Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '../common/guards/module-enabled.guard';
import { AuditLogService } from '../common/audit-log.service';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';

@ApiTags('patients')
@ApiBearerAuth()
@RequireModule('patients')
@UseGuards(ModuleEnabledGuard, JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.USER)
@Controller('patients')
export class PatientsController {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreatePatientDto) {
    return this.patientsService.createPatient(dto);
  }

  @Get('search')
  async search(@Query('name') name: string, @Req() req: Request) {
    if (!name || !name.trim()) {
      throw new BadRequestException('A non-empty "name" query parameter is required.');
    }
    const user = req.user as { userId: string } | undefined;
    await this.auditLog.record({
      userId: user?.userId,
      actorLabel: user ? `dashboard:${user.userId}` : 'dashboard:unknown',
      action: 'patient.search',
      resource: `name:${name.trim().slice(0, 60)}`,
      ipAddress: req.ip,
    });
    return this.patientsService.findByName(name);
  }

  @Roles(Role.ADMIN)
  @Post('prescriptions')
  addPrescription(@Body() dto: CreatePrescriptionDto) {
    return this.patientsService.addPrescription(dto);
  }

  @Get('history')
  async history(@Query('name') name: string, @Query('patientId') patientId: string | undefined, @Req() req: Request) {
    if (!name || !name.trim()) {
      throw new BadRequestException('A non-empty "name" query parameter is required.');
    }
    const user = req.user as { userId: string } | undefined;
    await this.auditLog.record({
      userId: user?.userId,
      actorLabel: user ? `dashboard:${user.userId}` : 'dashboard:unknown',
      action: 'patient.history.view',
      resource: patientId ? `patient:${patientId}` : `name:${name.trim().slice(0, 60)}`,
      ipAddress: req.ip,
    });
    return this.patientsService.renderPatientHistoryAsMarkdown(name, patientId);
  }
}
