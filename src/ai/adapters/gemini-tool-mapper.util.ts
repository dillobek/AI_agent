import { Type } from '@google/genai';
import { ToolDeclaration } from './ai-provider.adapter';

/**
 * Translates this app's provider-agnostic `ToolDeclaration` shape into
 * Gemini's function-declaration shape. Every parameter is coerced to
 * `Type.STRING` regardless of its logical type (number/boolean/etc.) —
 * intentional: `AgentToolsService`'s zod schemas do the real runtime
 * validation/coercion after the model calls a tool, so this only needs to
 * describe *that* a parameter exists, not enforce its JS type at the
 * Gemini layer.
 *
 * Shared by `GeminiProviderAdapter` (text agent, single-shot
 * `generateContent` calls) and `VoiceService` (Gemini Live ephemeral-token
 * endpoint) so both describe the exact same tool set to Gemini in the
 * exact same shape — no risk of the two translations drifting apart.
 */
export function toGeminiFunctionDeclaration(tool: ToolDeclaration) {
  const properties: Record<string, { type: typeof Type.STRING; description?: string; enum?: string[] }> = {};
  for (const [key, prop] of Object.entries(tool.parameters.properties)) {
    properties[key] = { type: Type.STRING, description: prop.description, enum: prop.enum };
  }
  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: Type.OBJECT,
      properties,
      required: tool.parameters.required ?? [],
    },
  };
}
