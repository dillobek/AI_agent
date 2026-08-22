import { IsNotEmpty, IsObject, IsString, MaxLength } from 'class-validator';

/**
 * Body for `POST /voice/execute-tool`. The frontend's Gemini Live session
 * receives a `functionCall` event directly from Google (over its own
 * browser-to-Gemini WebSocket) and relays it here rather than executing
 * anything client-side — the frontend never talks to Drive/Calendar/
 * Finance/etc directly, only this backend does.
 */
export class ExecuteVoiceToolDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  toolName: string;

  @IsObject()
  args: Record<string, unknown>;

  /** Gemini Live's own function-call id — used to dedupe a retried call across a WebSocket reconnect. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  callId: string;
}
