import { AiProviderName, AiProviderResult, AiSummaryRequest } from './ai.types.js';

export interface AiProvider {
  readonly name: AiProviderName;
  isAvailable(): boolean;
  summarizeReport(request: AiSummaryRequest): Promise<AiProviderResult>;
}
