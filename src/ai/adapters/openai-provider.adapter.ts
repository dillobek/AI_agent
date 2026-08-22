import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { AppConfigService } from '../../config/app-config.service';
import { AiProviderAdapter, ConversationTurn, EmbedResult, GenerateOptions, GenerateResult } from './ai-provider.adapter';

/** OpenAI Responses API implementation for text, tool calling, and embeddings. */
@Injectable()
export class OpenAiProviderAdapter implements AiProviderAdapter {
  private readonly logger = new Logger(OpenAiProviderAdapter.name);
  private client: OpenAI | null = null;

  constructor(private readonly config: AppConfigService) {}

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = this.config.get('OPENAI_API_KEY');
      if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const input: unknown[] = [{ role: 'developer', content: options.systemInstruction }];
    for (const turn of options.history) {
      if (turn.role === 'tool') {
        input.push({ type: 'function_call_output', call_id: turn.toolCallId, output: turn.text ?? '' });
      } else if (turn.role === 'model' && turn.toolCalls?.length) {
        for (const call of turn.toolCalls) input.push({ type: 'function_call', call_id: call.id, name: call.name, arguments: JSON.stringify(call.args) });
      } else {
        input.push({ role: turn.role === 'model' ? 'assistant' : 'user', content: turn.text ?? '' });
      }
    }
    const tools = options.tools.map((tool) => ({ type: 'function', name: tool.name, description: tool.description, parameters: { type: 'object', properties: tool.parameters.properties, required: tool.parameters.required ?? [], additionalProperties: false }, strict: false }));
    const response = await this.withTimeout(
      this.getClient().responses.create({ model: this.config.get('OPENAI_MODEL'), input: input as never, tools: tools as never }),
      options.timeoutMs,
      'OpenAI Responses API',
    );
    const functionCalls = (response.output as Array<{ type?: string; call_id?: string; name?: string; arguments?: string }>).filter((item) => item.type === 'function_call');
    if (functionCalls.length) return { toolCalls: functionCalls.map((call, index) => ({ id: call.call_id ?? `call_${Date.now()}_${index}`, name: call.name ?? 'unknown', args: this.parseArgs(call.arguments) })) };
    return { text: response.output_text ?? '' };
  }

  async embed(text: string): Promise<EmbedResult> {
    const response = await this.withTimeout(this.getClient().embeddings.create({ model: this.config.get('OPENAI_EMBEDDING_MODEL'), input: text }), this.config.get('AGENT_TOOL_TIMEOUT_MS'), 'OpenAI embeddings');
    const vector = response.data[0]?.embedding;
    if (!vector) throw new Error('OpenAI embeddings returned no vector.');
    return { vector };
  }

  private parseArgs(raw?: string): Record<string, unknown> { try { return raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { this.logger.warn('OpenAI returned invalid function arguments JSON'); return {}; } }
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> { let timer: NodeJS.Timeout; const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs); }); try { return await Promise.race([promise, timeout]); } finally { clearTimeout(timer!); } }
}
