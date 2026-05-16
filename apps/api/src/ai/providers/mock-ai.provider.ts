import { Injectable } from '@nestjs/common';
import { AiProvider } from '../ai.provider.interface.js';
import { AiProviderResult, AiSummaryRequest } from '../ai.types.js';
import { buildMockSummary } from '../ai-prompt.util.js';

@Injectable()
export class MockAiProvider implements AiProvider {
  readonly name = 'MOCK' as const;

  isAvailable(): boolean {
    return true;
  }

  async summarizeReport(request: AiSummaryRequest): Promise<AiProviderResult> {
    return {
      summary: buildMockSummary(request.snapshot, request.locale),
      model: 'mock-summary-v1',
    };
  }
}
