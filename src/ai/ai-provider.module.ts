import { Module } from '@nestjs/common';
import { GeminiProviderAdapter } from './adapters/gemini-provider.adapter';
import { AI_PROVIDER_ADAPTER } from './adapters/ai-provider.adapter';

/**
 * Standalone module for the AI provider binding (currently Gemini), kept
 * separate from `AiModule` so that other modules needing only embeddings/
 * generation (e.g. `RagModule`) can depend on it directly instead of on
 * the full `AiModule` — which itself depends on Drive/Finance/Patients and
 * would otherwise create an import cycle (RagModule is imported BY
 * PatientsModule, which is imported by AiModule).
 */
@Module({
  providers: [{ provide: AI_PROVIDER_ADAPTER, useClass: GeminiProviderAdapter }],
  exports: [AI_PROVIDER_ADAPTER],
})
export class AiProviderModule {}
