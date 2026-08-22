import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Body for `POST /voice/realtime-call` — the browser's WebRTC offer, which
 * this server forwards to OpenAI Realtime in exchange for an SDP answer.
 *
 * Validated rather than read straight off the body: a missing/blank offer
 * used to surface as an opaque 500 from an unguarded `throw new Error`,
 * where it is really a client mistake (400). The length cap is generous —
 * a real offer with several ICE candidates runs a few kilobytes — but
 * bounded so this endpoint can't be used to push arbitrary payloads
 * upstream.
 */
export class CreateRealtimeCallDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200_000)
  offerSdp: string;
}
