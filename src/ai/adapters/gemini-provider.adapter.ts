import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { AppConfigService } from '../../config/app-config.service';
import { AiProviderAdapter, ConversationTurn, EmbedResult, GenerateOptions, GenerateResult } from './ai-provider.adapter';
import { toGeminiFunctionDeclaration } from './gemini-tool-mapper.util';

/** Google Gemini implementation of `AiProviderAdapter`, using `@google/genai`. */
@Injectable()
export class GeminiProviderAdapter implements AiProviderAdapter {
  private readonly logger = new Logger(GeminiProviderAdapter.name);
  private client: GoogleGenAI | null = null;

  constructor(private readonly config: AppConfigService) {}

  private getClient(): GoogleGenAI {
    if (!this.client) {
      const apiKey = this.config.get('GEMINI_API_KEY');
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured.');
      }
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const client = this.getClient();
    const model = this.config.get('GEMINI_MODEL');

    const contents = options.history.map((turn) => this.toGeminiContent(turn));

    const call = client.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: options.systemInstruction,
        tools: options.tools.length ? [{ functionDeclarations: options.tools.map((t) => toGeminiFunctionDeclaration(t)) }] : undefined,
      },
    });

    const response = await this.withTimeout(call, options.timeoutMs, 'Gemini generateContent');

    const functionCalls = response.functionCalls ?? [];
    if (functionCalls.length > 0) {
      return {
        toolCalls: functionCalls.map((fc, i) => ({
          id: fc.id ?? `call_${i}_${Date.now()}`,
          name: fc.name ?? 'unknown',
          args: (fc.args as Record<string, unknown>) ?? {},
        })),
      };
    }

    return { text: response.text ?? '' };
  }

  async embed(text: string): Promise<EmbedResult> {
    const client = this.getClient();
    const model = this.config.get('GEMINI_EMBEDDING_MODEL');

    const call = client.models.embedContent({
      model,
      contents: text,
    });

    const response = await this.withTimeout(call, this.config.get('AGENT_TOOL_TIMEOUT_MS'), 'Gemini embedContent');
    const vector = response.embeddings?.[0]?.values;
    if (!vector) {
      throw new Error('Gemini embedContent returned no embedding vector.');
    }
    return { vector };
  }

  private toGeminiContent(turn: ConversationTurn) {
    if (turn.role === 'tool') {
      return {
        role: 'user' as const,
        parts: [
          {
            functionResponse: {
              name: turn.toolName ?? 'unknown',
              response: { result: turn.text ?? '' },
            },
          },
        ],
      };
    }
    if (turn.role === 'model' && turn.toolCalls?.length) {
      return {
        role: 'model' as const,
        parts: turn.toolCalls.map((tc) => ({ functionCall: { name: tc.name, args: tc.args } })),
      };
    }
    return {
      role: turn.role === 'model' ? ('model' as const) : ('user' as const),
      parts: [{ text: turn.text ?? '' }],
    };
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }
}
