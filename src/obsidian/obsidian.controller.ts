import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '../common/guards/module-enabled.guard';
import { ObsidianService } from './obsidian.service';

@ApiTags('obsidian')
@ApiBearerAuth()
@RequireModule('obsidian')
@UseGuards(ModuleEnabledGuard, JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('obsidian')
export class ObsidianController {
  constructor(private readonly obsidian: ObsidianService) {}

  @Post('sync')
  sync() {
    return this.obsidian.syncVaultToKnowledgeBase();
  }
}
