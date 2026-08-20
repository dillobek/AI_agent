/**
 * Provider-agnostic interface for the LLM powering the agent loop.
 * `GeminiProviderAdapter` (see gemini-provider.adapter.ts) is the only
 * implementation today; adding OpenAI/Anthropic/local models later means
 * writing one more class that satisfies this interface — no changes to
 * `AgentService`'s orchestration logic.
 */

export interface ToolDeclaration {
  name: string;
  description: string;
  /** JSON-Schema-ish parameter description, provider-specific shape is translated inside the adapter. */
  parameters: {
    type: 'OBJECT';
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

export interface ConversationTurn {
  role: 'user' | 'model' | 'tool';
  /** For role="tool", `toolName`/`toolCallId` identify which call this responds to. */
  toolName?: string;
  toolCallId?: string;
  text?: string;
  /** Structured tool-call requests emitted by the model (role="model" only). */
  toolCalls?: { id: string; name: string; args: Record<string, unknown> }[];
}

export interface GenerateOptions {
  systemInstruction: string;
  history: ConversationTurn[];
  tools: ToolDeclaration[];
  timeoutMs: number;
}

export interface GenerateResult {
  /** Present when the model produced a final natural-language answer. */
  text?: string;
  /** Present when the model wants to call one or more tools before answering. */
  toolCalls?: { id: string; name: string; args: Record<string, unknown> }[];
}

export interface EmbedResult {
  vector: number[];
}

export const AI_PROVIDER_ADAPTER = Symbol('AI_PROVIDER_ADAPTER');

export interface AiProviderAdapter {
  generate(options: GenerateOptions): Promise<GenerateResult>;
  embed(text: string): Promise<EmbedResult>;
}
