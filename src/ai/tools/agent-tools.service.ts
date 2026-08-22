import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { ToolDeclaration } from '../adapters/ai-provider.adapter';
import { AppConfigService } from '../../config/app-config.service';
import { GoogleDriveService } from '../../drive/google-drive.service';
import { FinanceService } from '../../finance/finance.service';
import { PatientsService } from '../../patients/patients.service';
import { ObsidianService } from '../../obsidian/obsidian.service';
import { YoutubeService } from '../../youtube/youtube.service';
import { PlanService } from '../../plan/plan.service';
import { todayRange } from '../../common/utils/date-range.util';
import { PersonalTelegramConnector } from '../../autonomy/personal-telegram.connector';

/** Thrown for a tool name the model referenced that isn't in our registry — always fail-closed, never silently ignored. */
export class UnknownToolError extends Error {
  constructor(name: string) {
    super(`Unknown tool: ${name}`);
  }
}

/** Thrown when a real tool's caller-supplied args don't match its schema. */
export class ToolArgumentError extends Error {}

/** Thrown when a tool maps to a module (or, for a multi-source tool, every one of its modules) that's currently disabled. */
export class ToolModuleDisabledError extends Error {
  constructor(moduleName: string | string[]) {
    const modules = Array.isArray(moduleName) ? moduleName : [moduleName];
    const label = modules.map((m) => `"${m}"`).join(' or ');
    super(
      modules.length > 1
        ? `None of the ${label} capabilities are enabled on this server.`
        : `The ${label} capability is currently disabled on this server.`,
    );
  }
}

/** Module flags a tool can depend on — kept in sync with `AppConfigService.moduleFlags`. */
type ModuleFlagKey = 'googleDrive' | 'obsidian' | 'patients' | 'finance' | 'youtube' | 'personalTelegram';

interface ToolDefinition {
  declaration: ToolDeclaration;
  schema: z.ZodTypeAny;
  /** A single required module flag, or — for a tool that degrades gracefully across sources — an array meaning "at least one of these must be enabled". */
  requiredModule?: ModuleFlagKey | ModuleFlagKey[];
  handler: (args: any) => Promise<string>;
}

/**
 * The full, closed set of tools the agent loop is allowed to call. Each
 * entry pairs a Gemini-facing declaration with a zod schema that actually
 * validates the arguments at runtime (never `as string` blind casts) and,
 * where relevant, the optional-module flag that must be enabled.
 */
@Injectable()
export class AgentToolsService {
  private readonly logger = new Logger(AgentToolsService.name);
  private readonly tools: Map<string, ToolDefinition>;

  constructor(
    private readonly config: AppConfigService,
    private readonly drive: GoogleDriveService,
    private readonly finance: FinanceService,
    private readonly patients: PatientsService,
    private readonly obsidian: ObsidianService,
    private readonly youtube: YoutubeService,
    private readonly plan: PlanService,
    @Inject(forwardRef(() => PersonalTelegramConnector)) private readonly personalTelegram: PersonalTelegramConnector,
  ) {
    this.tools = new Map(Object.entries(this.buildToolDefinitions()));
  }

  /** Only returns declarations for tools whose module (or, for a multi-source tool, at least one of its modules) is currently enabled. */
  getAvailableDeclarations(): ToolDeclaration[] {
    const flags = this.config.moduleFlags;
    return [...this.tools.values()]
      .filter((t) => this.moduleRequirementMet(t.requiredModule, flags))
      .map((t) => t.declaration);
  }

  async execute(name: string, rawArgs: unknown): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new UnknownToolError(name);
    }

    if (!this.moduleRequirementMet(tool.requiredModule, this.config.moduleFlags)) {
      throw new ToolModuleDisabledError(tool.requiredModule!);
    }

    const parsed = tool.schema.safeParse(rawArgs);
    if (!parsed.success) {
      throw new ToolArgumentError(
        `Invalid arguments for "${name}": ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      );
    }

    return tool.handler(parsed.data);
  }

  /** A tool with no `requiredModule` is always available; an array means "at least one of these", not "all of these" — used by tools that degrade gracefully across multiple optional sources (e.g. `search_files`). */
  private moduleRequirementMet(requiredModule: ModuleFlagKey | ModuleFlagKey[] | undefined, flags: Record<string, boolean>): boolean {
    if (!requiredModule) return true;
    const required = Array.isArray(requiredModule) ? requiredModule : [requiredModule];
    return required.some((key) => flags[key]);
  }

  private buildToolDefinitions(): Record<string, ToolDefinition> {
    return {
      find_latest_drive_file: {
        declaration: {
          name: 'find_latest_drive_file',
          description: 'Finds the latest medical or personal document from Google Drive by person name.',
          parameters: {
            type: 'OBJECT',
            properties: {
              personName: { type: 'string', description: 'Full name of the person' },
              docType: { type: 'string', description: 'Optional document type filter, e.g. "prescription"' },
            },
            required: ['personName'],
          },
        },
        schema: z
          .object({
            personName: z.string().min(1).max(200),
            docType: z.string().max(100).optional(),
          })
          .strict(),
        requiredModule: 'googleDrive',
        handler: async (args: { personName: string; docType?: string }) => {
          const file = await this.drive.findLatestFileByName(args.personName, args.docType);
          return file
            ? `Found latest document for ${args.personName}: ${file.name} (${file.webViewLink})`
            : `No documents found for ${args.personName}.`;
        },
      },

      get_patient_prescriptions: {
        declaration: {
          name: 'get_patient_prescriptions',
          description:
            'Retrieves diagnosis/prescription history for a patient by name. If more than one patient matches, returns a disambiguation request instead of guessing.',
          parameters: {
            type: 'OBJECT',
            properties: {
              personName: { type: 'string', description: 'Full name of the patient' },
              patientId: { type: 'string', description: 'Exact patient ID, if already known (skips disambiguation)' },
            },
            required: ['personName'],
          },
        },
        schema: z
          .object({
            personName: z.string().min(1).max(200),
            patientId: z.string().uuid().optional(),
          })
          .strict(),
        requiredModule: 'patients',
        handler: async (args: { personName: string; patientId?: string }) =>
          this.patients.renderPatientHistoryAsMarkdown(args.personName, args.patientId),
      },

      calculate_finance_summary: {
        declaration: {
          name: 'calculate_finance_summary',
          description: 'Calculates income, expense, and net profit/loss between two ISO dates.',
          parameters: {
            type: 'OBJECT',
            properties: {
              startDate: { type: 'string', description: 'ISO start date, e.g. 2026-01-01' },
              endDate: { type: 'string', description: 'ISO end date, e.g. 2026-01-31' },
            },
            required: ['startDate', 'endDate'],
          },
        },
        schema: z
          .object({
            startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'must be an ISO date'),
            endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'must be an ISO date'),
          })
          .strict(),
        requiredModule: 'finance',
        handler: async (args: { startDate: string; endDate: string }) => {
          const summary = await this.finance.calculateFinanceSummary(args.startDate, args.endDate);
          return (
            `Finance summary (${summary.period.startDate} to ${summary.period.endDate}): ` +
            `Income ${summary.totalIncome}, Expense ${summary.totalExpense}, ` +
            `Net P&L ${summary.netProfitLoss}, across ${summary.transactionCount} transactions.`
          );
        },
      },

      get_today_report: {
        declaration: {
          name: 'get_today_report',
          description: "Calculates today's income, expense, and net profit/loss. Use this for a quick daily report instead of calculate_finance_summary when the user just says \"today\"/\"bugungi hisobot\".",
          parameters: { type: 'OBJECT', properties: {}, required: [] },
        },
        schema: z.object({}).strict(),
        requiredModule: 'finance',
        handler: async () => {
          const { start, end } = todayRange();
          const summary = await this.finance.calculateFinanceSummary(start, end);
          return (
            `Today's report: Income ${summary.totalIncome}, Expense ${summary.totalExpense}, ` +
            `Net P&L ${summary.netProfitLoss}, across ${summary.transactionCount} transactions.`
          );
        },
      },

      search_files: {
        declaration: {
          name: 'search_files',
          description:
            'Searches for a file or note by name/keyword across every enabled source (Google Drive and the Obsidian vault) and returns matches from all of them in one call. Use this instead of asking the user which source to search — it checks whichever sources are actually enabled and says so if a source failed.',
          parameters: {
            type: 'OBJECT',
            properties: {
              query: { type: 'string', description: 'Name or keyword to search for' },
              docType: { type: 'string', description: 'Optional document type filter, e.g. "prescription" (Google Drive only)' },
            },
            required: ['query'],
          },
        },
        schema: z
          .object({
            query: z.string().min(1).max(200),
            docType: z.string().max(100).optional(),
          })
          .strict(),
        requiredModule: ['googleDrive', 'obsidian'],
        handler: async (args: { query: string; docType?: string }) => this.searchFiles(args.query, args.docType),
      },

      search_youtube: {
        declaration: {
          name: 'search_youtube',
          description:
            'Searches YouTube for a video (e.g. a specific episode of a show) and returns a link to the best match so it can be played.',
          parameters: {
            type: 'OBJECT',
            properties: {
              query: { type: 'string', description: 'What to search for, e.g. "Chuqur seriali 245-qism"' },
            },
            required: ['query'],
          },
        },
        schema: z.object({ query: z.string().min(1).max(200) }).strict(),
        requiredModule: 'youtube',
        handler: async (args: { query: string }) => {
          const video = await this.youtube.searchVideo(args.query);
          return video
            ? `Found "${video.title}"${video.channelTitle ? ` by ${video.channelTitle}` : ''}: https://www.youtube.com/watch?v=${video.videoId}`
            : `No YouTube video found for "${args.query}".`;
        },
      },

      send_telegram_message: {
        declaration: {
          name: 'send_telegram_message',
          description:
            'Sends a Telegram message from the owner\'s personal account to one named private contact. The server only sends if exactly one contact matches; otherwise it asks for a more specific name.',
          parameters: {
            type: 'OBJECT',
            properties: {
              contactName: { type: 'string', description: 'Recipient name or Telegram username' },
              text: { type: 'string', description: 'Exact message to prepare' },
            },
            required: ['contactName', 'text'],
          },
        },
        schema: z.object({ contactName: z.string().min(1).max(160), text: z.string().min(1).max(4000) }).strict(),
        requiredModule: 'personalTelegram',
        handler: async (args: { contactName: string; text: string }) =>
          this.personalTelegram.sendOutgoingMessage(args.contactName, args.text),
      },

      get_today_plan: {
        declaration: {
          name: 'get_today_plan',
          description:
            "Gets everything on today's plan: manually/voice-added plan items, today's Google Calendar events (if connected), and today's Obsidian daily note (if connected).",
          parameters: { type: 'OBJECT', properties: {}, required: [] },
        },
        schema: z.object({}).strict(),
        // No requiredModule: PlanItem itself has no *_ENABLED flag (see
        // PlanService); the Calendar/Obsidian sections are included
        // opportunistically inside renderTodayPlan() when those are on.
        handler: async () => this.plan.renderTodayPlan(),
      },

      add_plan_item: {
        declaration: {
          name: 'add_plan_item',
          description: "Adds a new item to today's plan.",
          parameters: {
            type: 'OBJECT',
            properties: {
              title: { type: 'string', description: 'Short title of the plan item' },
              description: { type: 'string', description: 'Optional extra detail' },
            },
            required: ['title'],
          },
        },
        schema: z
          .object({
            title: z.string().min(1).max(300),
            description: z.string().max(1000).optional(),
          })
          .strict(),
        handler: async (args: { title: string; description?: string }) => {
          // This tool is reachable from both the text agent chat and the
          // voice relay endpoint (M5) with no channel hint threaded through
          // — 'manual' (the default) just means "not synced from Calendar",
          // not literally "typed by hand".
          const item = await this.plan.addPlanItem(args.title, args.description);
          return `Added to today's plan: "${item.title}".`;
        },
      },
    };
  }

  /**
   * Backs `search_files`. Queries every enabled source in parallel and
   * degrades gracefully: a source that isn't enabled is skipped (not
   * treated as a failure), and a source that errors is reported as failed
   * without discarding results the other source already returned — a real-
   * time voice turn shouldn't go silent just because one integration is
   * temporarily down.
   */
  private async searchFiles(query: string, docType?: string): Promise<string> {
    const flags = this.config.moduleFlags;
    const tasks: Promise<{ source: string; lines: string[] }>[] = [];

    if (flags.googleDrive) {
      tasks.push(
        this.drive
          .searchFilesByName(query, docType, 'fuzzy')
          .then((files) => ({
            source: 'Google Drive',
            lines: files.slice(0, 5).map((f) => (f.webViewLink ? `${f.name} (${f.webViewLink})` : f.name)),
          }))
          .catch((err) => {
            this.logger.warn(`search_files: Google Drive search failed: ${(err as Error).message}`);
            return { source: 'Google Drive', lines: ['(search failed — try again shortly)'] };
          }),
      );
    }

    if (flags.obsidian) {
      const needle = query.toLowerCase();
      tasks.push(
        this.obsidian
          .listMarkdownFiles()
          .then((files) => ({
            source: 'Obsidian',
            lines: files.filter((f) => f.toLowerCase().includes(needle)).slice(0, 5),
          }))
          .catch((err) => {
            this.logger.warn(`search_files: Obsidian search failed: ${(err as Error).message}`);
            return { source: 'Obsidian', lines: ['(search failed — try again shortly)'] };
          }),
      );
    }

    const results = await Promise.all(tasks);
    const nonEmpty = results.filter((r) => r.lines.length > 0);
    if (nonEmpty.length === 0) {
      return `No files or notes matching "${query}" were found.`;
    }

    return nonEmpty.map((r) => `${r.source}:\n${r.lines.map((l) => `- ${l}`).join('\n')}`).join('\n\n');
  }
}
