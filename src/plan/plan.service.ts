import { Injectable, Logger } from '@nestjs/common';
import { PlanItemStatus } from '@prisma/client';
import { PrismaService } from '../config/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { N8nService } from '../n8n/n8n.service';
import { GoogleCalendarService } from '../calendar/calendar.service';
import { ObsidianService } from '../obsidian/obsidian.service';
import { todayRange } from '../common/utils/date-range.util';

/**
 * Owns the `PlanItem` table (the manual/voice-created part of "today's
 * plan") and aggregates it with Google Calendar + the Obsidian daily note
 * when those are enabled — the voice/text agent's `get_today_plan` and
 * `add_plan_item` tools are thin wrappers over this service.
 *
 * Unlike Drive/Obsidian/Calendar, PlanItem has no `*_ENABLED` flag of its
 * own: it's a plain in-app table with no external credentials, so there's
 * nothing to gate — it behaves like core infrastructure (similar to
 * ExecutionLog), not an optional integration.
 */
@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly n8n: N8nService,
    private readonly calendar: GoogleCalendarService,
    private readonly obsidian: ObsidianService,
  ) {}

  async addPlanItem(title: string, description?: string, scheduledFor?: string, source: 'manual' | 'voice' = 'manual') {
    const item = await this.prisma.planItem.create({
      data: {
        title,
        description,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : new Date(),
        source,
      },
    });

    void this.n8n.notifyEvent('plan.item_created', {
      id: item.id,
      title: item.title,
      scheduledFor: item.scheduledFor,
      source: item.source,
    });

    return item;
  }

  /**
   * Renders today's plan as plain text, combining `PlanItem` rows with
   * Google Calendar events and the Obsidian daily note when those
   * integrations are enabled. Each optional source fails independently —
   * one being down never hides the others.
   */
  async renderTodayPlan(): Promise<string> {
    const { start, end } = todayRange();
    const startDate = new Date(start);
    const endDate = new Date(end);
    const flags = this.config.moduleFlags;
    const sections: string[] = [];

    const items = await this.prisma.planItem.findMany({
      where: { scheduledFor: { gte: startDate, lte: endDate } },
      orderBy: { scheduledFor: 'asc' },
    });
    sections.push(
      items.length
        ? `Plan items:\n${items
            .map((i: { status: PlanItemStatus; title: string; description: string | null }) => `- [${i.status}] ${i.title}${i.description ? ` — ${i.description}` : ''}`)
            .join('\n')}`
        : 'Plan items: none added yet today.',
    );

    if (flags.calendar) {
      try {
        const events = await this.calendar.listEventsForRange(startDate, endDate);
        sections.push(
          events.length
            ? `Calendar events:\n${events.map((e) => `- ${e.summary} (${e.start})`).join('\n')}`
            : 'Calendar events: none today.',
        );
      } catch (err) {
        this.logger.warn(`renderTodayPlan: Calendar lookup failed: ${(err as Error).message}`);
        sections.push('Calendar events: could not be loaded right now.');
      }
    }

    if (flags.obsidian) {
      try {
        const note = await this.obsidian.fetchFileContent(this.dailyNotePath(startDate));
        sections.push(`Obsidian daily note:\n${note.slice(0, 1500)}`);
      } catch {
        // No daily note for today (or the vault doesn't use this template) —
        // not an error worth surfacing, just nothing to add for this source.
      }
    }

    return sections.join('\n\n');
  }

  private dailyNotePath(date: Date): string {
    const iso = date.toISOString().slice(0, 10); // YYYY-MM-DD
    const template = this.config.get('OBSIDIAN_DAILY_NOTE_PATH_TEMPLATE');
    return template.replace('{date}', iso);
  }
}
