import { BadRequestException, Controller, Get, Param, Patch, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PersonalAssistantService } from './personal-assistant.service';
import { ChannelPostService } from './channel-post.service';
import { CreateChannelPostDto } from './dto/create-channel-post.dto';
import { Body, Post } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateManagedChannelDto } from './dto/create-managed-channel.dto';

@ApiTags('personal-automation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('personal-automation')
export class AutonomyController {
  constructor(
    private readonly assistant: PersonalAssistantService,
    private readonly channelPosts: ChannelPostService,
  ) {}

  @Roles(Role.ADMIN)
  @Get('status')
  status() { return this.assistant.status(); }

  @Roles(Role.ADMIN)
  @Patch('pause')
  async pause() { await this.assistant.setPaused(true); return this.assistant.status(); }

  @Roles(Role.ADMIN)
  @Patch('resume')
  async resume() { await this.assistant.setPaused(false); return this.assistant.status(); }

  @Roles(Role.ADMIN)
  @Get('channel-posts')
  posts() { return this.channelPosts.recent(); }

  @Roles(Role.ADMIN)
  @Post('channel-posts/publish')
  publish(@Body() dto: CreateChannelPostDto) { return this.channelPosts.createAndPublish(dto); }

  @Roles(Role.ADMIN)
  @Get('channels')
  channels() { return this.channelPosts.channels(); }

  @Roles(Role.ADMIN)
  @Post('channels')
  addChannel(@Body() dto: CreateManagedChannelDto) { return this.channelPosts.registerChannel(dto); }

  @Roles(Role.ADMIN)
  @Post('channels/:channelId/policy')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 128 * 1024 } }))
  async uploadPolicy(
    @Param('channelId') channelId: string,
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
  ) {
    if (!file || !file.originalname.toLowerCase().endsWith('.md')) {
      throw new BadRequestException('Upload one .md policy file');
    }
    return this.channelPosts.uploadPolicy(channelId, file.originalname, file.buffer.toString('utf8'));
  }
}
