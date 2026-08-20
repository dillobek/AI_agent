import { Injectable, Logger } from '@nestjs/common';
import { google, drive_v3 } from 'googleapis';
import { naturalSortByNameDesc } from '../common/utils/natural-sort.util';
import { retryIdempotent } from '../common/utils/retry.util';
import { AppConfigService } from '../config/app-config.service';
import { ModuleDisabledException } from '../common/exceptions/module-disabled.exception';

export interface DriveFileResult {
  id: string;
  name: string;
  webViewLink?: string;
  webContentLink?: string;
  modifiedTime?: string;
}

/**
 * Google Drive & Obsidian Storage Engine (Module 2) — Drive half.
 * - Search files by person/patient name, optionally scoped to a root folder.
 * - Smart natural sorting: parses trailing numbers/dates so
 *   "Xaydarov Saydullo 4" outranks "Xaydarov Saydullo 1".
 * - Supports both "exact" (quoted, case-sensitive substring match via the
 *   Drive API's `name = '...'`) and "fuzzy" (`name contains '...'`) modes.
 * - Paginates through all result pages rather than only the first.
 * - The Google API client is constructed lazily, and only if
 *   GOOGLE_DRIVE_ENABLED=true — so a deployment that never turns this
 *   module on never even attempts to load credentials.
 */
@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);
  private drive: drive_v3.Drive | null = null;

  constructor(private readonly config: AppConfigService) {}

  private getClient(): drive_v3.Drive {
    if (!this.config.moduleFlags.googleDrive) {
      throw new ModuleDisabledException('googleDrive');
    }
    if (!this.drive) {
      const auth = new google.auth.GoogleAuth({
        keyFile: this.config.get('GOOGLE_APPLICATION_CREDENTIALS'),
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      });
      this.drive = google.drive({ version: 'v3', auth: auth as any });
    }
    return this.drive;
  }

  /**
   * Searches Drive for files matching `personName`, newest first.
   * `mode: 'exact'` matches the name field exactly (still case-insensitive,
   * per the Drive API); `mode: 'fuzzy'` (default) does a substring match.
   */
  async searchFilesByName(
    personName: string,
    docType?: string,
    mode: 'exact' | 'fuzzy' = 'fuzzy',
  ): Promise<DriveFileResult[]> {
    const drive = this.getClient();
    const rootFolderId = this.config.get('GOOGLE_DRIVE_ROOT_FOLDER_ID');
    const pageSizeCap = this.config.get('GOOGLE_DRIVE_PAGE_SIZE');

    const nameClause = mode === 'exact' ? `name = '${this.escapeQuery(personName)}'` : `name contains '${this.escapeQuery(personName)}'`;
    let q = `${nameClause} and trashed = false`;
    if (docType) {
      q += ` and name contains '${this.escapeQuery(docType)}'`;
    }
    if (rootFolderId) {
      q += ` and '${this.escapeQuery(rootFolderId)}' in parents`;
    }

    const allFiles: DriveFileResult[] = [];
    let pageToken: string | undefined;
    const maxPages = 10; // hard safety cap regardless of how many pages Drive reports

    for (let page = 0; page < maxPages; page++) {
      const response = await retryIdempotent(
        () =>
          drive.files.list({
            q,
            orderBy: 'modifiedTime desc',
            pageSize: pageSizeCap,
            pageToken,
            fields: 'nextPageToken, files(id, name, webViewLink, webContentLink, modifiedTime)',
          }),
        {
          maxAttempts: 4,
          baseDelayMs: 300,
          isRetryable: (err) => this.isRetryableGoogleError(err),
        },
      );

      allFiles.push(...((response.data.files ?? []) as DriveFileResult[]));
      pageToken = response.data.nextPageToken ?? undefined;
      if (!pageToken) break;
    }

    return allFiles;
  }

  /**
   * Finds the single latest document for a person, using Drive's own
   * modifiedTime ordering plus a natural-sort fallback for trailing
   * numbered/dated filenames (e.g. "Xaydarov Saydullo 1/2/4").
   */
  async findLatestFileByName(personName: string, docType?: string): Promise<DriveFileResult | null> {
    const files = await this.searchFilesByName(personName, docType, 'fuzzy');
    if (!files || files.length === 0) {
      this.logger.debug(`No Drive files found for "${personName}"`);
      return null;
    }

    const sorted = naturalSortByNameDesc(files);
    return sorted[0];
  }

  private isRetryableGoogleError(err: unknown): boolean {
    const code = (err as { code?: number })?.code;
    // Retry on rate limiting / transient server errors; do not retry on
    // auth failures or bad requests (those won't succeed on retry).
    return code === 429 || (typeof code === 'number' && code >= 500);
  }

  private escapeQuery(value: string): string {
    return value.replace(/'/g, "\\'");
  }
}
