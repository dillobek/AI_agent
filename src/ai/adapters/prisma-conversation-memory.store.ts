import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { ConversationMemoryStore } from './conversation-memory.store';
import { ConversationTurn } from './ai-provider.adapter';

const MAX_TURNS_PER_SESSION = 20;

@Injectable()
export class PrismaConversationMemoryStore implements ConversationMemoryStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async load(channelKey: string): Promise<ConversationTurn[]> {
    const session = await this.prisma.conversationSession.findUnique({ where: { channelKey } });
    if (!session || session.expiresAt < new Date()) return [];
    return (session.history as unknown as ConversationTurn[]) ?? [];
  }

  async save(channelKey: string, history: ConversationTurn[]): Promise<void> {
    // Cap history length so a very long-running conversation can't grow the
    // stored JSON (and the prompt built from it) without bound.
    const bounded = history.slice(-MAX_TURNS_PER_SESSION);
    const ttlMinutes = this.config.get('SESSION_TTL_MINUTES');
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.prisma.conversationSession.upsert({
      where: { channelKey },
      update: { history: bounded as any, expiresAt },
      create: { channelKey, history: bounded as any, expiresAt },
    });
  }

  async clear(channelKey: string): Promise<void> {
    await this.prisma.conversationSession.deleteMany({ where: { channelKey } });
  }
}
