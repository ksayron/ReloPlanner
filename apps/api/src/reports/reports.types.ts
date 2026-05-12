import type { LegalReadinessResult } from '../legal-readiness/legal-readiness.types.js';
import type { FinancialReadinessResult } from '../financial-readiness/financial-readiness.types.js';

export type ReportGenerationStatus = 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';
export type ReportVariant = 'snapshot' | 'ai-summary';
export type ReportLocale = 'en' | 'ru';

export type GapSeverity = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'MINOR';

export interface ReportGenerationMeta {
  status: ReportGenerationStatus;
  startedAt: Date;
  completedAt: Date | null;
  error: string | null;
}

export interface ReportProfileSummary {
  profileId: string;
  targetCountry: string;
  targetCity: string | null;
  currentCountry: string;
  yearsExperience: number;
  desiredRole: string;
}

export interface ReportSkillBreakdownItem {
  competencyId: string;
  competencyName: string;
  matchScore: number;
  weight: number;
  recommendationType: string;
  reason: string;
}

export interface ReportGapItem {
  competencyId: string;
  competencyName: string;
  currentLevel: string;
  requiredLevel: string;
  matchScore: number;
  priority: string;
  roleRelevance: string;
  severity: GapSeverity;
  reason: string;
}

export interface ReportRoadmapStep {
  orderIndex: number;
  competencyId: string;
  competencyName: string;
  currentDisplayLevel: string;
  requiredDisplayLevel: string;
  estimatedHours: number;
  dependsOn: string[];
  status: string;
  reason: string;
}

export interface RelocationReadinessReportSnapshot {
  reportType: 'RELOCATION_READINESS_REPORT';
  analysisId: string;
  generatedAt: Date;
  profileSummary: ReportProfileSummary;
  readiness: {
    fitScore: number;
    readinessLevel: 'READY' | 'NEAR_READY' | 'PREPARATION_REQUIRED';
    totalPrepMonths: number;
    timeEstimate: {
      optimisticHours: number;
      realisticHours: number;
      criticalPathHours: number;
    } | null;
  };
  skillBreakdown: ReportSkillBreakdownItem[];
  detectedGaps: ReportGapItem[];
  roadmap: ReportRoadmapStep[];
  marketContext: {
    country: string;
    city: string | null;
    snapshotDate: string;
    source: string;
    totalVacancies: number;
    jobMarketNote: string;
  };
  legalReadiness?: LegalReadinessResult;
  financialReadiness?: FinancialReadinessResult;
}

export interface ReportAiSummary {
  executiveSummary: string;
  topStrengths: string[];
  topRisks: string[];
  recommendedStrategy: string;
  advisoryDisclaimer: string;
}

export interface ReportAiSummaryMeta {
  grade: 'EASY' | 'REASONING';
  requestedProvider: 'OPENAI' | 'OPENROUTER' | 'MOCK';
  attemptedProviders: Array<'OPENAI' | 'OPENROUTER' | 'MOCK'>;
  providerUsed: 'OPENAI' | 'OPENROUTER' | 'MOCK';
  fallbackUsed: boolean;
  modelUsed: string;
  failureReasons: Partial<Record<'OPENAI' | 'OPENROUTER' | 'MOCK', string>>;
}
