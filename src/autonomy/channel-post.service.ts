import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ChannelPostStatus, PersonalPlatform } from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';
import { ExecutionLogService } from '../common/execution-log.service';
import { PrismaService } from '../config/prisma.service';
import { PersonalTelegramConnector } from './personal-telegram.connector';
import { CreateChannelPostDto } from './dto/create-channel-post.dto';
import { AgentService } from '../ai/agent.service';
import { CreateManagedChannelDto } from './dto/create-managed-channel.dto';

/** Creates a visual via a private image-worker webhook, then publishes it. */
@Injectable()
export class ChannelPostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly telegram: PersonalTelegramConnector,
    private readonly logs: ExecutionLogService,
    private readonly agent: AgentService,
  ) {}

  async createAndPublish(dto: CreateChannelPostDto) {
    const channel = await this.prisma.managedChannel.findUnique({
      where: { platform_channelId: { platform: PersonalPlatform.TELEGRAM, channelId: dto.channelId } },
    });
    if (!channel) throw new Error('Channel is not registered in the dashboard');
    const composed = await this.compose(channel.contentPolicyMarkdown, dto.topic);
    const post = await this.prisma.channelPost.create({
      data: { platform: PersonalPlatform.TELEGRAM, channelId: dto.channelId, caption: composed.caption, imagePrompt: composed.imagePrompt },
    });
    try {
      const imageUrl = await this.generateImage(composed.imagePrompt);
      await this.telegram.publishChannelPost(dto.channelId, composed.caption, imageUrl);
      const published = await this.prisma.channelPost.update({
        where: { id: post.id }, data: { status: ChannelPostStatus.PUBLISHED, imageUrl, publishedAt: new Date() },
      });
      await this.logs.record({
        actor: 'owner:channel-publisher', toolName: 'telegram.channel.publish',
        input: { channelId: dto.channelId, postId: post.id }, output: { imageGenerated: true, published: true },
      });
      return published;
    } catch (error) {
      const failed = await this.prisma.channelPost.update({
        where: { id: post.id }, data: { status: ChannelPostStatus.FAILED, error: (error as Error).message.slice(0, 500) },
      });
      await this.logs.record({
        actor: 'owner:channel-publisher', toolName: 'telegram.channel.publish', input: { channelId: dto.channelId, postId: post.id },
        success: false, errorMsg: 'Channel post generation or publishing failed',
      });
      return failed;
    }
  }

  async recent() {
    return this.prisma.channelPost.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async channels() {
    return this.prisma.managedChannel.findMany({ orderBy: { title: 'asc' } });
  }

  async registerChannel(dto: CreateManagedChannelDto) {
    return this.prisma.managedChannel.upsert({
      where: { platform_channelId: { platform: PersonalPlatform.TELEGRAM, channelId: dto.channelId } },
      update: { title: dto.title },
      create: { platform: PersonalPlatform.TELEGRAM, channelId: dto.channelId, title: dto.title },
    });
  }

  async uploadPolicy(channelId: string, fileName: string, content: string) {
    if (!content.trim()) throw new Error('Markdown policy file is empty');
    return this.prisma.managedChannel.update({
      where: { platform_channelId: { platform: PersonalPlatform.TELEGRAM, channelId } },
      data: { contentPolicyMarkdown: content, policyFileName: fileName },
    });
  }

  private async generateImage(prompt: string): Promise<string> {
    const url = this.config.get('CHANNEL_IMAGE_GENERATION_WEBHOOK_URL');
    if (!url) throw new Error('CHANNEL_IMAGE_GENERATION_WEBHOOK_URL is not configured');
    const response = await axios.post(url, { prompt }, { timeout: 90_000 });
    const imageUrl = response.data?.imageUrl;
    if (typeof imageUrl !== 'string' || !/^https?:\/\//i.test(imageUrl)) {
      throw new Error('Image worker returned no valid imageUrl');
    }
    return imageUrl;
  }

  private async compose(policy: string, topic: string): Promise<{ caption: string; imagePrompt: string }> {
    const answer = await this.agent.generateTextOnly(
      [
        'You are a Telegram channel editor. Follow the supplied Markdown content policy exactly.',
        'Return exactly two sections: CAPTION: followed by the post text, and IMAGE_PROMPT: followed by an English visual prompt.',
        'No claims, prices, advice, or facts that cannot be supported by the supplied topic/policy. Never add a watermark or in-image text unless the policy explicitly asks for it.',
        `CONTENT POLICY:\n${policy || 'Use concise, useful Uzbek posts with a natural tone.'}`,
      ].join('\n'),
      `Create a publication about this topic: ${topic}`,
    );
    const match = /^CAPTION:\s*([\s\S]*?)\s*IMAGE_PROMPT:\s*([\s\S]+)$/i.exec(answer);
    if (!match) throw new Error('AI composer returned an invalid channel post format');
    return { caption: match[1].trim().slice(0, 4000), imagePrompt: match[2].trim().slice(0, 2000) };
  }
}
