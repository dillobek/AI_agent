import { ToolDeclaration } from '../ai/adapters/ai-provider.adapter';

/**
 * Translation layer between this app's provider-agnostic tool registry
 * (`AgentToolsService.getAvailableDeclarations()`) and the shape the OpenAI
 * Realtime API expects in `session.tools`, plus the session object itself.
 *
 * Kept out of `VoiceService` so the exact wire shape is testable on its own
 * and so there is one place to change when OpenAI revises the session
 * schema — the same reason `gemini-tool-mapper.util.ts` exists for the text
 * adapter.
 */

/** A single custom function tool as the Realtime API declares it. */
export interface OpenAiRealtimeTool {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
}

/**
 * The registry stores `parameters.type` as Gemini's uppercase `'OBJECT'`
 * enum; OpenAI wants plain lowercase JSON Schema. Property-level types are
 * already lowercase in the registry, so only the container needs mapping.
 */
export function toOpenAiRealtimeTool(tool: ToolDeclaration): OpenAiRealtimeTool {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties: tool.parameters.properties as Record<string, unknown>,
      required: tool.parameters.required ?? [],
      additionalProperties: false,
    },
  };
}

export interface RealtimeSessionOptions {
  model: string;
  instructions: string;
  /** Output voice. Cannot be changed once the model has produced audio in a session. */
  voice: string;
  transcriptionModel: string;
  /** ISO-639-1 hint for the transcriber ("uz"). Empty string omits it, letting OpenAI auto-detect. */
  language: string;
  tools: ToolDeclaration[];
}

/**
 * Builds the GA-shape Realtime session object sent alongside the SDP offer.
 *
 * Notes on what is and isn't set here:
 *
 * - `audio.input.format` / `audio.output.format` are deliberately omitted.
 *   Over WebRTC the codec is negotiated in the SDP itself, so pinning a PCM
 *   format here would at best be ignored and at worst rejected.
 * - `audio.input.transcription` is what produces the user-side transcript.
 *   Without it, `conversation.item.input_audio_transcription.completed`
 *   never fires and the UI only ever shows the assistant's half of the
 *   conversation.
 * - `tools` is the whole point: a session created without it can hear and
 *   answer, but cannot reach any of this app's data — which looks exactly
 *   like "the assistant works but the brain is missing".
 */
export function buildRealtimeSession(options: RealtimeSessionOptions): Record<string, unknown> {
  const transcription: Record<string, unknown> = { model: options.transcriptionModel };
  if (options.language) transcription.language = options.language;

  return {
    type: 'realtime',
    model: options.model,
    instructions: options.instructions,
    output_modalities: ['audio'],
    audio: {
      input: {
        transcription,
        // Semantic VAD ends the user's turn on meaning rather than on a
        // fixed silence threshold, which handles the mid-sentence pauses
        // that trip up server_vad — and lets the user talk over a reply.
        turn_detection: { type: 'semantic_vad' },
      },
      output: { voice: options.voice },
    },
    tools: options.tools.map(toOpenAiRealtimeTool),
    tool_choice: 'auto',
  };
}
