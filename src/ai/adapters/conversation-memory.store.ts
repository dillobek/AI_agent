import { ConversationTurn } from './ai-provider.adapter';

/**
 * Per-channel conversation memory. `channelKey` MUST uniquely identify the
 * (integration, user) pair — e.g. `telegram:123456789`, `dashboard:<userId>`,
 * `n8n:<requestId>` — so that isolation between users/channels is a
 * property of the key itself, not something callers have to remember to
 * enforce. See `PrismaConversationMemoryStore` for the concrete
 * implementation (backed by the `ConversationSession` table with a TTL).
 */
export interface ConversationMemoryStore {
  load(channelKey: string): Promise<ConversationTurn[]>;
  save(channelKey: string, history: ConversationTurn[]): Promise<void>;
  clear(channelKey: string): Promise<void>;
}
