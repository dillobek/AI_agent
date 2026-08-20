import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Whitelisted actions an n8n workflow is allowed to trigger on this API.
 * Deliberately a closed set — n8n can never invoke arbitrary code or
 * arbitrary NestJS providers, only these specific, reviewed operations.
 */
export const N8N_TRIGGER_ACTIONS = [
  'agent_prompt',
  'finance_summary',
  'patient_history',
] as const;

export class N8nTriggerDto {
  @IsIn(N8N_TRIGGER_ACTIONS)
  action: (typeof N8N_TRIGGER_ACTIONS)[number];

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  requestId?: string;
}
