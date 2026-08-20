import { Module } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { DriveModule } from '../drive/drive.module';
import { RagModule } from '../rag/rag.module';
import { AuthModule } from '../auth/auth.module';
import { N8nEventsModule } from '../n8n/n8n-events.module';

@Module({
  imports: [DriveModule, RagModule, AuthModule, N8nEventsModule],
  controllers: [PatientsController],
  providers: [PatientsService],
  exports: [PatientsService],
})
export class PatientsModule {}
