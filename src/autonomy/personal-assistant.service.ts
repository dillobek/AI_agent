import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { PersonalMessageDirection, PersonalPlatform } from '@prisma/client';
import { AgentService } from '../ai/agent.service';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../config/prisma.service';
import { ExecutionLogService } from '../common/execution-log.service';

export type IncomingPersonalMessage = {
  platform: PersonalPlatform;
  externalConversationId: string;
  text: string;
  displayName?: string;
  externalMessageId?: string;
};

export type ReplyDecision =
  | { kind: 'reply'; text: string }
  | { kind: 'skip'; reason: string };

/**
 * The platform-neutral core for Telegram/Instagram personal DMs.
 * Connectors may send a message only after this service returns `reply`.
 * It persists per-contact history and deliberately calls the AI's text-only
 * API so a social message can never invoke an operational tool.
 */
@Injectable()
export class PersonalAssistantService {
  private readonly logger = new Logger(PersonalAssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AgentService)) private readonly agent: AgentService,
    private readonly config: AppConfigService,
    private readonly executionLog: ExecutionLogService,
  ) {}

  async handleIncoming(message: IncomingPersonalMessage): Promise<ReplyDecision> {
    const text = message.text.trim();
    if (!text) return { kind: 'skip', reason: 'Empty message' };

    const settings = await this.prisma.personalAssistantSettings.upsert({
      where: { id: 'primary' },
      update: {},
      create: { id: 'primary' },
    });
    const conversation = await this.prisma.personalConversation.upsert({
      where: { platform_externalId: { platform: message.platform, externalId: message.externalConversationId } },
      update: { displayName: message.displayName, lastMessageAt: new Date() },
      create: {
        platform: message.platform,
        externalId: message.externalConversationId,
        displayName: message.displayName,
        lastMessageAt: new Date(),
      },
    });

    // The connector can redeliver after a network reconnect. Store once and
    // do not send a duplicate reply for a message ID we have already seen.
    if (message.externalMessageId) {
      const seen = await this.prisma.personalMessage.findUnique({
        where: { conversationId_externalId: { conversationId: conversation.id, externalId: message.externalMessageId } },
      });
      if (seen) return { kind: 'skip', reason: 'Already processed' };
    }

    await this.prisma.personalMessage.create({
      data: {
        conversationId: conversation.id,
        externalId: message.externalMessageId,
        direction: PersonalMessageDirection.INBOUND,
        text,
      },
    });

    if (settings.paused || conversation.paused || !settings.fullAutoReplies || !conversation.autoReply) {
      return { kind: 'skip', reason: 'Automation is paused for this conversation' };
    }

    if (this.requiresOwnerConfirmation(text)) {
      return { kind: 'skip', reason: 'Sensitive request requires owner confirmation' };
    }

    const history = await this.prisma.personalMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { sentAt: 'desc' },
      take: this.config.get('PERSONAL_REPLY_MAX_HISTORY'),
    });
    const transcript = history
      .reverse()
      .map((item) => `${item.direction === PersonalMessageDirection.INBOUND ? 'CONTACT' : 'OWNER'}: ${item.text}`)
      .join('\n');

    const reply = await this.agent.generateTextOnly(
      this.systemPrompt(settings.ownerPersona, conversation.personaNotes),
      `Conversation with ${conversation.displayName || 'a contact'}:\n${transcript}\n\nWrite only the next reply as the owner.`,
    );

    await this.prisma.personalMessage.create({
      data: { conversationId: conversation.id, direction: PersonalMessageDirection.OUTBOUND, text: reply },
    });
    await this.executionLog.record({
      actor: `personal:${message.platform}:${message.externalConversationId}`,
      toolName: 'personal.reply.generate',
      input: { platform: message.platform, conversationId: message.externalConversationId },
      output: { generated: true, chars: reply.length },
    });
    return { kind: 'reply', text: reply };
  }

  async setPaused(paused: boolean): Promise<void> {
    await this.prisma.personalAssistantSettings.upsert({
      where: { id: 'primary' }, update: { paused }, create: { id: 'primary', paused },
    });
  }

  async status() {
    const [settings, conversationCount, activeConversationCount] = await Promise.all([
      this.prisma.personalAssistantSettings.upsert({ where: { id: 'primary' }, update: {}, create: { id: 'primary' } }),
      this.prisma.personalConversation.count(),
      this.prisma.personalConversation.count({ where: { paused: false, autoReply: true } }),
    ]);
    return {
      fullAutoReplies: settings.fullAutoReplies,
      paused: settings.paused,
      personalTelegramConfigured: this.config.get('PERSONAL_TELEGRAM_ENABLED'),
      instagramConfigured: this.config.get('INSTAGRAM_ENABLED'),
      conversationCount,
      activeConversationCount,
    };
  }

  private requiresOwnerConfirmation(text: string): boolean {
    // These are hard stop categories, not a general approval queue. The owner
    // is alerted by the control bot/monitor, while the connector sends nothing.
    return /\b(otp|one[ -]?time code|verification code|password|parol|tasdiqlash kodi|sms kod|karta raqam|cvv|pin|pul yubor|to['’]?lov qil|payment|bank transfer|crypto|seed phrase|ssh key)\b/i.test(text);
  }

  private systemPrompt(ownerPersona: string, conversationNotes: string): string {
    return [
      'You write short, natural messages on behalf of one private account owner.',
      'Reply in the contact\'s language and match the informal/formal tone from history.',
      'Use the history to preserve relationships and facts; never invent personal facts, promises, prices, deadlines, meetings, or agreements.',
      'Never reveal that you are AI, automation, or an assistant. Never ask for or send passwords, OTPs, payment data, bank details, keys, or confidential data.',
      'Do not operate systems, make payments, negotiate binding commitments, or give legal/medical/financial advice. If required, keep the reply neutral and say the owner will confirm directly.',
      `Owner style notes: ${ownerPersona || 'Warm, concise, respectful; do not overuse emojis.'}`,
      `This contact notes: ${conversationNotes || 'No special notes yet; infer only from this chat.'}`,
    ].join('\n');
  }
}
