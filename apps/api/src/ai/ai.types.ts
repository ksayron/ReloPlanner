import { RelocationReadinessReportSnapshot } from '../reports/reports.types.js';
import { ReportLocale } from '../reports/reports.types.js';

export type AiProviderName = 'OPENAI' | 'OPENROUTER' | 'MOCK';
export type AiTaskGrade = 'EASY' | 'REASONING';

export interface AiReportSummary {
  executiveSummary: string;
  topStrengths: string[];
  topRisks: string[];
  recommendedStrategy: string;
  advisoryDisclaimer: string;
}

export interface AiSummaryRequest {
  snapshot: RelocationReadinessReportSnapshot;
  grade: AiTaskGrade;
  locale: ReportLocale;
}

export interface AiProviderResult {
  summary: AiReportSummary;
  model: string;
}

export interface AiSummaryMeta {
  grade: AiTaskGrade;
  localeUsed: ReportLocale;
  requestedProvider: AiProviderName;
  attemptedProviders: AiProviderName[];
  providerUsed: AiProviderName;
  fallbackUsed: boolean;
  modelUsed: string;
  failureReasons: Partial<Record<AiProviderName, string>>;
}

export interface AiSummaryResponse {
  summary: AiReportSummary;
  meta: AiSummaryMeta;
}

export interface AiRoutingPolicy {
  defaults: Record<AiTaskGrade, AiProviderName>;
}

export interface AiRoutingPolicyView extends AiRoutingPolicy {
  orders: Record<AiTaskGrade, AiProviderName[]>;
  availableProviders: AiProviderName[];
}

export const AI_PROVIDERS: AiProviderName[] = ['OPENAI', 'OPENROUTER', 'MOCK'];
export const AI_TASK_GRADES: AiTaskGrade[] = ['EASY', 'REASONING'];

export const isAiProviderName = (value: string): value is AiProviderName =>
  AI_PROVIDERS.includes(value as AiProviderName);

export const isAiTaskGrade = (value: string): value is AiTaskGrade =>
  AI_TASK_GRADES.includes(value as AiTaskGrade);
