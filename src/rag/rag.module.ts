import { Module } from '@nestjs/common';
import { RagService } from './rag.service';
import { AiProviderModule } from '../ai/ai-provider.module';

@Module({
  imports: [AiProviderModule],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
