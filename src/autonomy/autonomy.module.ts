import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { AutonomyController } from './autonomy.controller';
import { PersonalAssistantService } from './personal-assistant.service';
import { PersonalTelegramConnector } from './personal-telegram.connector';
import { ChannelPostService } from './channel-post.service';

@Module({
  imports: [AiModule, AuthModule],
  controllers: [AutonomyController],
  providers: [PersonalAssistantService, PersonalTelegramConnector, ChannelPostService],
  exports: [PersonalAssistantService, PersonalTelegramConnector],
})
export class AutonomyModule {}
