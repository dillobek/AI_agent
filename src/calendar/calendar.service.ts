import { Injectable, Logger } from '@nestjs/common';
import { google, calendar_v3 } from 'googleapis';
import { retryIdempotent } from '../common/utils/retry.util';
import { AppConfigService } from '../config/app-config.service';
import { ModuleDisabledException } from '../common/exceptions/module-disabled.exception';

export interface CalendarEventResult {
  id: string;
  summary: string;
  start: string;
  end: string;
}

/**
 * Google Calendar read access for the voice/text agent's "today's plan"
 * tool. Uses the same service account as GOOGLE_APPLICATION_CREDENTIALS
 * (the Drive-folder-sharing pattern) — share the target calendar with that
 * account's client_email and grant "Make changes to events" (see README
 * section 8 for the setup guide and a known gotcha: the service account
 * can't interactively "accept" the share invite, but API access still works
 * once the ACL grant exists regardless of what the Calendar UI shows).
 *
 * Read-only for now (`listEventsForRange`); writing PlanItems back to
 * Calendar is a follow-up, not required for today's-plan aggregation.
 */
@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private calendar: calendar_v3.Calendar | null = null;

  constructor(private readonly config: AppConfigService) {}

  private getClient(): calendar_v3.Calendar {
    if (!this.config.moduleFlags.calendar) {
      throw new ModuleDisabledException('calendar');
    }
    if (!this.calendar) {
      const auth = new google.auth.GoogleAuth({
        keyFile: this.config.get('GOOGLE_APPLICATION_CREDENTIALS'),
        scopes: ['https://www.googleapis.com/auth/calendar.events'],
      });
      this.calendar = google.calendar({ version: 'v3', auth: auth as any });
    }
    return this.calendar;
  }

  async listEventsForRange(start: Date, end: Date): Promise<CalendarEventResult[]> {
    const calendar = this.getClient();
    const calendarId = this.config.get('GOOGLE_CALENDAR_ID');

    const response = await retryIdempotent(
      () =>
        calendar.events.list({
          calendarId,
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 50,
        }),
      {
        maxAttempts: 4,
        baseDelayMs: 300,
        isRetryable: (err) => this.isRetryableGoogleError(err),
      },
    );

    return (response.data.items ?? []).map((event) => ({
      id: event.id ?? '',
      summary: event.summary ?? '(no title)',
      start: event.start?.dateTime ?? event.start?.date ?? '',
      end: event.end?.dateTime ?? event.end?.date ?? '',
    }));
  }

  private isRetryableGoogleError(err: unknown): boolean {
    const code = (err as { code?: number })?.code;
    return code === 429 || (typeof code === 'number' && code >= 500);
  }
}
