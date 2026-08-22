import { Module } from '@nestjs/common';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';
import { AiModule } from '../ai/ai.module';
import { N8nEventsModule } from '../n8n/n8n-events.module';

/**
 * AiModule is imported (not re-declared) so VoiceService reuses the exact
 * same AgentToolsService/ToolExecutionService singleton the text agent
 * uses — one tool registry, one execution/logging path, two entry points
 * (AgentService's reasoning loop, and this module's direct relay).
 *
 * N8nEventsModule (not the full N8nModule, which itself depends on
 * PlanModule -> ... -> would cycle back here) supplies the outbound-only
 * N8nService for the voice.session_started / voice.report_requested
 * events — mirrors the exact pattern PlanModule already uses.
 */
@Module({
  imports: [AiModule, N8nEventsModule],
  controllers: [VoiceController],
  providers: [VoiceService],
})
export class VoiceModule {}
