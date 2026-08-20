import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { Agent as HttpsAgent } from 'https';
import { AppConfigService } from '../config/app-config.service';
import { RagService } from '../rag/rag.service';
import { ModuleDisabledException } from '../common/exceptions/module-disabled.exception';

interface ObsidianFileListing {
  files: string[];
}

/**
 * Obsidian Integration (Module 2).
 * Fetches .md notes from the Obsidian Local REST API and indexes them into
 * the Vector DB (via RagService) + PostgreSQL knowledge base cache.
 *
 * TLS verification is ON by default (Obsidian's Local REST API plugin
 * often uses a self-signed cert for its HTTPS port). Skipping verification
 * requires BOTH `OBSIDIAN_ALLOW_INSECURE_TLS=true` AND a non-production
 * NODE_ENV — see env.schema.ts, which already refuses that combination in
 * production at startup, so this is defense-in-depth, not the only guard.
 */
@Injectable()
export class ObsidianService {
  private readonly logger = new Logger(ObsidianService.name);
  private client: AxiosInstance | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly rag: RagService,
  ) {}

  private getClient(): AxiosInstance {
    if (!this.config.moduleFlags.obsidian) {
      throw new ModuleDisabledException('obsidian');
    }
    if (!this.client) {
      const allowInsecureTls = this.config.get('OBSIDIAN_ALLOW_INSECURE_TLS') && !this.config.isProduction;
      this.client = axios.create({
        baseURL: this.config.get('OBSIDIAN_API_URL'),
        timeout: this.config.get('OBSIDIAN_REQUEST_TIMEOUT_MS'),
        headers: { Authorization: `Bearer ${this.config.get('OBSIDIAN_API_KEY')}` },
        httpsAgent: new HttpsAgent({ rejectUnauthorized: !allowInsecureTls }),
      });
    }
    return this.client;
  }

  /** Rejects any path attempting to escape the vault root (`..`, absolute paths, or an encoded traversal). */
  private assertSafeVaultPath(path: string) {
    const decoded = decodeURIComponent(path);
    if (decoded.includes('..') || decoded.startsWith('/') || decoded.startsWith('\\')) {
      throw new BadRequestException(`Refusing unsafe Obsidian vault path: "${path}"`);
    }
  }

  async listMarkdownFiles(): Promise<string[]> {
    const { data } = await this.getClient().get<ObsidianFileListing>('/vault/');
    return (data.files ?? []).filter((f) => f.endsWith('.md'));
  }

  async fetchFileContent(path: string): Promise<string> {
    this.assertSafeVaultPath(path);
    const { data } = await this.getClient().get(`/vault/${encodeURIComponent(path)}`, {
      headers: { Accept: 'text/markdown' },
    });
    return typeof data === 'string' ? data : JSON.stringify(data);
  }

  /**
   * Pulls every .md note and indexes it into the vector store + PostgreSQL
   * knowledge base cache. Each note's success/failure is tracked
   * independently and the return value is honest about both — a note that
   * fails to embed (e.g. Chroma unreachable) is reported as a failure, not
   * silently counted as indexed.
   */
  async syncVaultToKnowledgeBase(): Promise<{ indexed: number; skipped: number; failed: number; total: number }> {
    const files = await this.listMarkdownFiles();
    let indexed = 0;
    let skipped = 0;
    let failed = 0;

    for (const path of files) {
      try {
        const content = await this.fetchFileContent(path);
        const result = await this.rag.syncDocument({ source: 'obsidian', title: path, path, content });
        if (result.skipped) skipped += 1;
        else indexed += 1;
      } catch (err) {
        failed += 1;
        this.logger.warn(`Failed to index Obsidian note "${path}": ${(err as Error).message}`);
      }
    }

    this.logger.log(`Obsidian sync: ${indexed} indexed, ${skipped} unchanged, ${failed} failed, ${files.length} total`);
    return { indexed, skipped, failed, total: files.length };
  }
}
