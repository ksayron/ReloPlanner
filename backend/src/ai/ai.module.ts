import { Module } from '@nestjs/common';
import { AiRoutingService } from './ai-routing.service.js';
import { AiReportEnrichmentService } from './ai-report-enrichment.service.js';
import { OpenAiProvider } from './providers/openai-ai.provider.js';
import { OpenRouterProvider } from './providers/openrouter-ai.provider.js';
import { MockAiProvider } from './providers/mock-ai.provider.js';
import { AiAdminController } from './ai-admin.controller.js';

@Module({
  controllers: [AiAdminController],
  providers: [
    AiRoutingService,
    AiReportEnrichmentService,
    OpenAiProvider,
    OpenRouterProvider,
    MockAiProvider,
  ],
  exports: [AiRoutingService, AiReportEnrichmentService],
})
export class AiModule {}
