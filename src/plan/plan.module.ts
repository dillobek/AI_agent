import { Module } from '@nestjs/common';
import { PlanService } from './plan.service';
import { N8nEventsModule } from '../n8n/n8n-events.module';
import { CalendarModule } from '../calendar/calendar.module';
import { ObsidianModule } from '../obsidian/obsidian.module';

@Module({
  imports: [N8nEventsModule, CalendarModule, ObsidianModule],
  providers: [PlanService],
  exports: [PlanService],
})
export class PlanModule {}
