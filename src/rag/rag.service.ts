import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { createHash } from 'crypto';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../config/prisma.service';
import { ModuleDisabledException } from '../common/exceptions/module-disabled.exception';
import { AI_PROVIDER_ADAPTER, AiProviderAdapter } from '../ai/adapters/ai-provider.adapter';
import { chunkText } from './chunking.util';
import { VectorStoreNotSupportedException } from './rag.exceptions';

export interface RagQueryResult {
  id: string;
  title: string;
  content: string;
  score: number;
  source: string;
}

export interface SyncDocumentInput {
  source: string;
  title: string;
  path: string;
  content: string;
  ownerId?: string;
}

/**
 * Vector Database / RAG (Overview #4) — real implementation.
 *
 * - Embeddings come from the configured AI provider (Gemini's
 *   text-embedding-004 by default) via `AiProviderAdapter.embed`, not a
 *   placeholder.
 * - Documents are split into overlapping chunks (`chunkText`) before being
 *   embedded, each with a deterministic ID (`${knowledgeDocumentId}::${index}`)
 *   so re-syncing the same document reuses/overwrites the same chunk IDs
 *   instead of accumulating duplicates.
 * - Re-syncing a document whose content hash hasn't changed is a no-op
 *   (skips re-embedding entirely).
 * - When a document shrinks (fewer chunks than last time), the now-stale
 *   trailing chunk IDs are explicitly deleted from the collection.
 * - `query()` filters out results below RAG_SCORE_THRESHOLD and always
 *   reports which document each result came from (source attribution).
 * - If Chroma is unreachable or errors, `syncDocument` reports failure —
 *   it never claims success for an indexing operation that didn't
 *   actually reach the vector store.
 */
@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private chromaCollectionId: string | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    @Inject(AI_PROVIDER_ADAPTER) private readonly aiProvider: AiProviderAdapter,
  ) {}

  private assertEnabled() {
    if (!this.config.moduleFlags.rag) {
      throw new ModuleDisabledException('rag');
    }
  }

  private assertChroma() {
    const provider = this.config.get('VECTOR_STORE_PROVIDER');
    if (provider !== 'chroma') {
      throw new VectorStoreNotSupportedException(provider);
    }
  }

  /** Creates the Chroma collection if it doesn't already exist (idempotent), and caches its id. */
  private async ensureCollection(): Promise<string> {
    if (this.chromaCollectionId) return this.chromaCollectionId;

    const chromaUrl = this.config.get('CHROMA_URL');
    const name = this.config.get('CHROMA_COLLECTION');
    const { data } = await axios.post(`${chromaUrl}/api/v1/collections`, { name, get_or_create: true });
    this.chromaCollectionId = data.id;
    return data.id;
  }

  /**
   * Chunks + embeds + upserts one document into the vector store, and
   * records its metadata (content hash, chunk count) in KnowledgeDocument
   * so future syncs can detect "unchanged" and skip work, and detect
   * "shrank" to clean up now-stale chunk IDs.
   */
  async syncDocument(input: SyncDocumentInput): Promise<{ skipped: boolean; chunkCount: number }> {
    this.assertEnabled();
    this.assertChroma();

    const contentHash = createHash('sha256').update(input.content).digest('hex');

    const existing = await this.prisma.knowledgeDocument.findUnique({
      where: { source_path: { source: input.source, path: input.path } },
    });

    if (existing && existing.contentHash === contentHash) {
      return { skipped: true, chunkCount: existing.chunkCount };
    }

    const doc = await this.prisma.knowledgeDocument.upsert({
      where: { source_path: { source: input.source, path: input.path } },
      update: { title: input.title, contentHash, ownerId: input.ownerId },
      create: {
        source: input.source,
        path: input.path,
        title: input.title,
        contentHash,
        ownerId: input.ownerId,
        chunkCount: 0,
      },
    });

    const chunkSize = this.config.get('RAG_CHUNK_SIZE');
    const overlap = this.config.get('RAG_CHUNK_OVERLAP');
    const chunks = chunkText(input.content, chunkSize, overlap);

    const collectionId = await this.ensureCollection();
    const chromaUrl = this.config.get('CHROMA_URL');

    const ids: string[] = [];
    const embeddings: number[][] = [];
    const documents: string[] = [];
    const metadatas: Record<string, unknown>[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const embedding = await this.aiProvider.embed(chunks[i]);
      ids.push(`${doc.id}::${i}`);
      embeddings.push(embedding.vector);
      documents.push(chunks[i]);
      metadatas.push({
        source: input.source,
        title: input.title,
        path: input.path,
        documentId: doc.id,
        ownerId: input.ownerId ?? null,
        chunkIndex: i,
        indexedAt: new Date().toISOString(),
      });
    }

    if (ids.length > 0) {
      // Any failure here (network, Chroma error) propagates — the caller
      // must NOT treat this as success. See ObsidianService.syncVaultToKnowledgeBase.
      await axios.post(`${chromaUrl}/api/v1/collections/${collectionId}/upsert`, {
        ids,
        embeddings,
        documents,
        metadatas,
      });
    }

    // Clean up stale trailing chunk IDs if the document shrank.
    const previousCount = existing?.chunkCount ?? 0;
    if (previousCount > chunks.length) {
      const staleIds = Array.from({ length: previousCount - chunks.length }, (_, i) => `${doc.id}::${chunks.length + i}`);
      await axios
        .post(`${chromaUrl}/api/v1/collections/${collectionId}/delete`, { ids: staleIds })
        .catch((err) => this.logger.warn(`Failed to delete stale chunks for ${doc.id}: ${(err as Error).message}`));
    }

    await this.prisma.knowledgeDocument.update({ where: { id: doc.id }, data: { chunkCount: chunks.length } });

    return { skipped: false, chunkCount: chunks.length };
  }

  /** Deletes a document and all of its chunks (e.g. when the source file was removed). */
  async deleteDocument(source: string, path: string): Promise<void> {
    this.assertEnabled();
    this.assertChroma();

    const existing = await this.prisma.knowledgeDocument.findUnique({ where: { source_path: { source, path } } });
    if (!existing) return;

    const collectionId = await this.ensureCollection();
    const chromaUrl = this.config.get('CHROMA_URL');
    const ids = Array.from({ length: existing.chunkCount }, (_, i) => `${existing.id}::${i}`);

    if (ids.length > 0) {
      await axios
        .post(`${chromaUrl}/api/v1/collections/${collectionId}/delete`, { ids })
        .catch((err) => this.logger.warn(`Failed to delete chunks for ${existing.id}: ${(err as Error).message}`));
    }
    await this.prisma.knowledgeDocument.delete({ where: { id: existing.id } });
  }

  /** Semantic search, filtered by RAG_SCORE_THRESHOLD, each result attributed to its source document. */
  async query(text: string, topK = 5): Promise<RagQueryResult[]> {
    this.assertEnabled();
    this.assertChroma();

    const collectionId = await this.ensureCollection();
    const chromaUrl = this.config.get('CHROMA_URL');
    const threshold = this.config.get('RAG_SCORE_THRESHOLD');

    const embedding = await this.aiProvider.embed(text);
    const { data } = await axios.post(`${chromaUrl}/api/v1/collections/${collectionId}/query`, {
      query_embeddings: [embedding.vector],
      n_results: topK,
    });

    const ids: string[] = data.ids?.[0] ?? [];
    const documents: string[] = data.documents?.[0] ?? [];
    const distances: number[] = data.distances?.[0] ?? [];
    const metadatas: Record<string, unknown>[] = data.metadatas?.[0] ?? [];

    return ids
      .map((id, i) => ({
        id,
        title: (metadatas[i]?.title as string) ?? 'untitled',
        source: (metadatas[i]?.source as string) ?? 'unknown',
        content: documents[i],
        // Chroma's default distance is L2/cosine-distance-like (lower = closer); convert to a 0..1 "score" where higher = more relevant.
        score: 1 / (1 + (distances[i] ?? 1)),
      }))
      .filter((r) => r.score >= threshold);
  }
}
