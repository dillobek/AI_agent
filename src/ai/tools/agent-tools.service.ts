import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { ToolDeclaration } from '../adapters/ai-provider.adapter';
import { AppConfigService } from '../../config/app-config.service';
import { GoogleDriveService } from '../../drive/google-drive.service';
import { FinanceService } from '../../finance/finance.service';
import { PatientsService } from '../../patients/patients.service';

/** Thrown for a tool name the model referenced that isn't in our registry — always fail-closed, never silently ignored. */
export class UnknownToolError extends Error {
  constructor(name: string) {
    super(`Unknown tool: ${name}`);
  }
}

/** Thrown when a real tool's caller-supplied args don't match its schema. */
export class ToolArgumentError extends Error {}

/** Thrown when a tool maps to a module that's currently disabled. */
export class ToolModuleDisabledError extends Error {
  constructor(moduleName: string) {
    super(`The "${moduleName}" capability is currently disabled on this server.`);
  }
}

interface ToolDefinition {
  declaration: ToolDeclaration;
  schema: z.ZodTypeAny;
  requiredModule?: 'googleDrive' | 'patients' | 'finance';
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
  ) {
    this.tools = new Map(Object.entries(this.buildToolDefinitions()));
  }

  /** Only returns declarations for tools whose module is currently enabled. */
  getAvailableDeclarations(): ToolDeclaration[] {
    const flags = this.config.moduleFlags;
    return [...this.tools.values()]
      .filter((t) => !t.requiredModule || flags[t.requiredModule])
      .map((t) => t.declaration);
  }

  async execute(name: string, rawArgs: unknown): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new UnknownToolError(name);
    }

    if (tool.requiredModule && !this.config.moduleFlags[tool.requiredModule]) {
      throw new ToolModuleDisabledError(tool.requiredModule);
    }

    const parsed = tool.schema.safeParse(rawArgs);
    if (!parsed.success) {
      throw new ToolArgumentError(
        `Invalid arguments for "${name}": ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      );
    }

    return tool.handler(parsed.data);
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
    };
  }
}
