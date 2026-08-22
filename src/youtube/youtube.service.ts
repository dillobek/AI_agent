import { Injectable, Logger } from '@nestjs/common';
import { google, youtube_v3 } from 'googleapis';
import { retryIdempotent } from '../common/utils/retry.util';
import { AppConfigService } from '../config/app-config.service';
import { ModuleDisabledException } from '../common/exceptions/module-disabled.exception';

export interface YoutubeVideoResult {
  videoId: string;
  title: string;
  channelTitle?: string;
}

/**
 * YouTube Data API v3 search, for the voice/text agent's "play a video"
 * tool. Read-only public search only needs a plain API key (unlike Drive/
 * Calendar, no service account or OAuth is involved) — see
 * https://console.cloud.google.com/apis/credentials.
 *
 * The client is constructed lazily, and only if YOUTUBE_ENABLED=true, same
 * defense-in-depth pattern as GoogleDriveService/ObsidianService.
 */
@Injectable()
export class YoutubeService {
  private readonly logger = new Logger(YoutubeService.name);
  private youtube: youtube_v3.Youtube | null = null;

  constructor(private readonly config: AppConfigService) {}

  private getClient(): youtube_v3.Youtube {
    if (!this.config.moduleFlags.youtube) {
      throw new ModuleDisabledException('youtube');
    }
    if (!this.youtube) {
      this.youtube = google.youtube({ version: 'v3', auth: this.config.get('YOUTUBE_API_KEY') });
    }
    return this.youtube;
  }

  /** Returns the single best-matching video for `query`, or null if nothing was found. */
  async searchVideo(query: string): Promise<YoutubeVideoResult | null> {
    const youtube = this.getClient();

    const response = await retryIdempotent(
      () =>
        youtube.search.list({
          part: ['snippet'],
          q: query,
          type: ['video'],
          maxResults: 1,
        }),
      {
        maxAttempts: 4,
        baseDelayMs: 300,
        isRetryable: (err) => this.isRetryableGoogleError(err),
      },
    );

    const item = response.data.items?.[0];
    const videoId = item?.id?.videoId;
    if (!videoId) {
      this.logger.debug(`No YouTube video found for "${query}"`);
      return null;
    }

    return {
      videoId,
      title: item.snippet?.title ?? query,
      channelTitle: item.snippet?.channelTitle ?? undefined,
    };
  }

  private isRetryableGoogleError(err: unknown): boolean {
    const code = (err as { code?: number })?.code;
    return code === 429 || (typeof code === 'number' && code >= 500);
  }
}
