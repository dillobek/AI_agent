import { Module } from '@nestjs/common';
import { ObsidianService } from './obsidian.service';
import { ObsidianController } from './obsidian.controller';
import { RagModule } from '../rag/rag.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [RagModule, AuthModule],
  controllers: [ObsidianController],
  providers: [ObsidianService],
  exports: [ObsidianService],
})
export class ObsidianModule {}
