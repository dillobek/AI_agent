import { Module } from '@nestjs/common';
import { N8nService } from './n8n.service';

/**
 * Standalone module for the outbound-only N8nService, kept separate from
 * N8nModule (which owns the inbound /n8n/trigger endpoint and depends on
 * Ai/Finance/Patients modules) to avoid a circular import: Finance and
 * Patients need to *emit* events via N8nService, while N8nModule's
 * controller needs to *call into* Finance and Patients.
 */
@Module({
  providers: [N8nService],
  exports: [N8nService],
})
export class N8nEventsModule {}
