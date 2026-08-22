import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createDecipheriv, createHash, randomUUID } from 'crypto';
import { PersonalPlatform } from '@prisma/client';
import { TelegramClient } from 'telegram';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { StringSession } from 'telegram/sessions';
import { AppConfigService } from '../config/app-config.service';
import { PersonalAssistantService } from './personal-assistant.service';
import { N8nService } from '../n8n/n8n.service';

/**
 * MTProto adapter boundary. A VPS worker authenticated to the owner's Telegram
 * account calls `receivePrivateMessage`; this class gives it idempotency,
 * per-contact memory and safe Full Auto decisions. It intentionally has no
 * Bot API token: personal DMs require a user-account MTProto session.
 *
 * The worker is activated only after `PERSONAL_TELEGRAM_ENABLED=true` and a
 * one-time encrypted session setup. Do not put OTPs or sessions in git/.env.
 */
@Injectable()
export class PersonalTelegramConnector implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PersonalTelegramConnector.name);
  private client?: TelegramClient;
  private readonly pendingMessages = new Map<string, { entity: unknown; displayName: string; text: string; expiresAt: number }>();
  private readonly PENDING_MESSAGE_TTL_MS = 10 * 60 * 1000;

  constructor(
    private readonly assistant: PersonalAssistantService,
    private readonly config: AppConfigService,
    private readonly n8n: N8nService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.get('PERSONAL_TELEGRAM_ENABLED')) return;
    const encryptedSession = this.config.get('PERSONAL_TELEGRAM_SESSION');
    if (!encryptedSession) {
      this.logger.warn('Personal Telegram is enabled but has no encrypted session. Complete the one-time VPS login before enabling auto replies.');
      return;
    }

    try {
      const session = new StringSession(this.decryptSession(encryptedSession));
      this.client = new TelegramClient(
        session,
        this.config.get('TELEGRAM_API_ID'),
        this.config.get('TELEGRAM_API_HASH'),
        { connectionRetries: 5 },
      );
      await this.client.connect();
      if (!(await this.client.checkAuthorization())) {
        this.logger.error('Personal Telegram session is not authorized. Auto replies remain off until the owner completes login again.');
        await this.client.disconnect();
        this.client = undefined;
        return;
      }
      this.client.addEventHandler((event) => this.onTelegramEvent(event), new NewMessage({ incoming: true }));
      this.logger.log('Personal Telegram connector is connected and listening for private messages.');
    } catch (error) {
      this.client = undefined;
      this.logger.error(`Personal Telegram connector did not start: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.disconnect();
  }

  async receivePrivateMessage(input: { chatId: string; messageId: string; text: string; displayName?: string }) {
    const decision = await this.assistant.handleIncoming({
      platform: PersonalPlatform.TELEGRAM,
      externalConversationId: input.chatId,
      externalMessageId: input.messageId,
      displayName: input.displayName,
      text: input.text,
    });
    if (this.config.get('N8N_PERSONAL_TELEGRAM_SYNC')) {
      await this.n8n.notifyEvent('personal.telegram.message_received', {
        chatId: input.chatId,
        messageId: input.messageId,
        displayName: input.displayName,
        text: input.text,
        decision: decision.kind,
      });
    }
    if (decision.kind === 'skip') this.logger.debug(`Telegram personal message skipped: ${decision.reason}`);
    return decision;
  }

  /** Publishes only to a channel where the authenticated owner is an admin. */
  async publishChannelPost(channelId: string, caption: string, imageUrl: string): Promise<void> {
    if (!this.client) throw new Error('Personal Telegram connector is not connected');
    await this.client.sendFile(channelId, { file: imageUrl, caption });
  }

  async sendOutgoingMessage(contactName: string, text: string): Promise<string> {
    if (!this.client) return 'Shaxsiy Telegram ulanishi hali sozlanmagan yoki ulanmagan.';
    const normalizedName = this.normalize(contactName);
    const normalizedText = text.trim();
    if (!normalizedName || !normalizedText) return 'Kontakt ismi va yuboriladigan xabar kerak.';

    const dialogs = (await this.client.getDialogs({ limit: 200 })) as any[];
    const candidates = dialogs
      .filter((dialog) => dialog?.isUser && dialog?.entity && !dialog.entity?.bot)
      .map((dialog) => {
        const entity = dialog.entity;
        const displayName = [entity.firstName, entity.lastName].filter(Boolean).join(' ') || entity.username || String(entity.id);
        return { entity, displayName, normalized: this.normalize(displayName) };
      })
      .filter((candidate) => candidate.normalized.includes(normalizedName) || normalizedName.includes(candidate.normalized));

    if (candidates.length === 0) return `"${contactName}" nomli kontakt topilmadi. Telegramdagi to'liq ism yoki username'ni ayting.`;
    if (candidates.length > 1) return `Bir nechta mos kontakt topildi: ${candidates.slice(0, 5).map((item) => item.displayName).join(', ')}. To'liq ism yoki username'ni aniqlashtiring.`;

    const candidate = candidates[0];
    if (!this.config.get('PERSONAL_TELEGRAM_REQUIRE_CONFIRMATION')) {
      await this.client.sendMessage(candidate.entity as any, { message: normalizedText });
      await this.n8n.notifyEvent('personal.telegram.message_sent', {
        displayName: candidate.displayName,
        text: normalizedText,
        confirmationRequired: false,
      });
      return `${candidate.displayName}ga xabar yuborildi.`;
    }

    this.sweepPendingMessages();
    const confirmationId = randomUUID().slice(0, 8).toUpperCase();
    this.pendingMessages.set(confirmationId, { entity: candidate.entity, displayName: candidate.displayName, text: normalizedText, expiresAt: Date.now() + this.PENDING_MESSAGE_TTL_MS });
    return `Xabar tayyor: ${candidate.displayName}ga “${normalizedText}”. Yuborish uchun Control Botga /confirm ${confirmationId} deb yozing. Kod 10 daqiqa amal qiladi.`;
  }

  async confirmOutgoingMessage(confirmationId: string): Promise<string> {
    if (!this.client) return 'Shaxsiy Telegram ulanishi hali sozlanmagan yoki ulanmagan.';
    this.sweepPendingMessages();
    const key = confirmationId.trim().toUpperCase();
    const pending = this.pendingMessages.get(key);
    if (!pending) return 'Tasdiqlash kodi topilmadi yoki muddati tugagan.';
    this.pendingMessages.delete(key);
    await this.client.sendMessage(pending.entity as any, { message: pending.text });
    await this.n8n.notifyEvent('personal.telegram.message_sent', { displayName: pending.displayName, text: pending.text, confirmationId: key });
    return `${pending.displayName}ga xabar yuborildi.`;
  }

  private async onTelegramEvent(event: NewMessageEvent): Promise<void> {
    if (!event.isPrivate || !event.message.senderId || !this.client) return;
    const sender = await event.message.getSender();
    const displayName = [sender && (sender as any).firstName, sender && (sender as any).lastName].filter(Boolean).join(' ') || undefined;
    const decision = await this.receivePrivateMessage({
      chatId: event.message.senderId.toString(),
      messageId: String(event.message.id),
      text: event.message.text || '',
      displayName,
    });
    if (decision.kind === 'reply') {
      await this.client.sendMessage(event.message.senderId, { message: decision.text });
    }
  }

  /** Decrypts a v1:aes-256-gcm envelope kept only in PERSONAL_TELEGRAM_SESSION. */
  private decryptSession(envelope: string): string {
    const [version, ivBase64, tagBase64, ciphertextBase64] = envelope.split(':');
    if (version !== 'v1' || !ivBase64 || !tagBase64 || !ciphertextBase64) {
      throw new Error('PERSONAL_TELEGRAM_SESSION must be an encrypted v1 session envelope');
    }
    const key = createHash('sha256').update(this.config.get('PERSONAL_TELEGRAM_SESSION_ENCRYPTION_KEY')).digest();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivBase64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextBase64, 'base64')), decipher.final()]).toString('utf8');
  }

  private sweepPendingMessages(): void {
    const now = Date.now();
    for (const [id, pending] of this.pendingMessages) if (pending.expiresAt <= now) this.pendingMessages.delete(id);
  }

  private normalize(value: string): string {
    return value.toLocaleLowerCase('uz').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }
}
