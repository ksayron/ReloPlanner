import { Injectable, Logger } from '@nestjs/common';
import { AiProvider } from './ai.provider.interface.js';
import {
  AiProviderName,
  AiSummaryResponse,
  AiTaskGrade,
  isAiProviderName,
} from './ai.types.js';
import { AiRoutingService } from './ai-routing.service.js';
import { OpenAiProvider } from './providers/openai-ai.provider.js';
import { OpenRouterProvider } from './providers/openrouter-ai.provider.js';
import { MockAiProvider } from './providers/mock-ai.provider.js';
import { RelocationReadinessReportSnapshot } from '../reports/reports.types.js';
import { buildMockSummary } from './ai-prompt.util.js';

@Injectable()
export class AiReportEnrichmentService {
  private readonly logger = new Logger(AiReportEnrichmentService.name);
  private readonly providers: Map<AiProviderName, AiProvider>;

  constructor(
    private readonly routing: AiRoutingService,
    openAiProvider: OpenAiProvider,
    openRouterProvider: OpenRouterProvider,
    mockProvider: MockAiProvider,
  ) {
    this.providers = new Map<AiProviderName, AiProvider>([
      ['OPENAI', openAiProvider],
      ['OPENROUTER', openRouterProvider],
      ['MOCK', mockProvider],
    ]);
  }

  async summarizeSnapshot(
    snapshot: RelocationReadinessReportSnapshot,
    grade: AiTaskGrade,
  ): Promise<AiSummaryResponse> {
    const order = this.routing.resolveProviderOrder(grade);
    const requestedProvider = order[0];
    const attemptedProviders: AiProviderName[] = [];
    const failureReasons: Partial<Record<AiProviderName, string>> = {};

    for (const providerName of order) {
      attemptedProviders.push(providerName);
      const provider = this.providers.get(providerName);
      if (!provider) {
        failureReasons[providerName] = 'Provider is not registered';
        continue;
      }

      if (!provider.isAvailable()) {
        failureReasons[providerName] = 'Provider is unavailable';
        continue;
      }

      try {
        const result = await provider.summarizeReport({ snapshot, grade });
        return {
          summary: result.summary,
          meta: {
            grade,
            requestedProvider,
            attemptedProviders,
            providerUsed: providerName,
            fallbackUsed: providerName !== requestedProvider,
            modelUsed: result.model,
            failureReasons,
          },
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown provider error';
        failureReasons[providerName] = message;
        this.logger.warn(`AI provider ${providerName} failed: ${message}`);
      }
    }

    // Last-resort guard, should rarely happen due MOCK provider fallback.
    return {
      summary: buildMockSummary(snapshot),
      meta: {
        grade,
        requestedProvider:
          requestedProvider && isAiProviderName(requestedProvider)
            ? requestedProvider
            : 'MOCK',
        attemptedProviders,
        providerUsed: 'MOCK',
        fallbackUsed: true,
        modelUsed: 'mock-summary-v1',
        failureReasons,
      },
    };
  }
}
