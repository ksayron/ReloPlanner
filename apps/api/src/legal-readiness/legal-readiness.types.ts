import type {
  LegalAdvice as SharedLegalAdvice,
  LegalQuestion as SharedLegalQuestion,
  LegalReadinessResult as SharedLegalReadinessResult,
  LegalRiskLevel as SharedLegalRiskLevel,
  LegalRoute as SharedLegalRoute,
  LegalWarning as SharedLegalWarning,
  RegionType as SharedRegionType,
  TriggeredLegalRule as SharedTriggeredLegalRule,
} from '@reloplanner/shared-contracts';

export type RegionType = SharedRegionType;

export type LegalRiskLevel = SharedLegalRiskLevel;

export type LegalQuestionType = 'BOOLEAN';
export type LegalQuestionPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type LegalWarningSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type LegalRouteApplicability = 'POSSIBLE' | 'LESS_LIKELY' | 'UNKNOWN';

export interface LegalReadinessFacts {
  sourceCountry: string;
  targetCountry: string;
  sourceRegion: RegionType;
  targetRegion: RegionType;
  targetCity?: string | null;
  desiredRole?: string | null;
  hasExistingWorkAuthorization?: boolean | null;
  hasJobOffer?: boolean | null;
  hasRecognizedDegree?: boolean | null;
  hasFormalEducation?: boolean | null;
  targetSalaryGrossAnnual?: number | null;
  relocationWithFamily?: boolean | null;
  hasFamilyDocumentsPrepared?: boolean | null;
  hasCheckedDependentResidenceRules?: boolean | null;
}

export interface LegalQuestion extends SharedLegalQuestion {}

export interface LegalRoute extends SharedLegalRoute {}

export interface LegalWarning extends SharedLegalWarning {}

export interface LegalAdvice extends SharedLegalAdvice {}

export interface TriggeredLegalRule extends SharedTriggeredLegalRule {}

export interface LegalRuleResult {
  ruleCode: string;
  riskLevel?: LegalRiskLevel;
  riskShift?: -1 | 1;
  visaCheckLikelyRequired?: boolean;
  questions?: LegalQuestion[];
  possibleRoutes?: LegalRoute[];
  warnings?: LegalWarning[];
  advice?: LegalAdvice[];
  recommendedArticleSlugs?: string[];
}

export interface LegalKnowledgeRule {
  code: string;
  description: string;
  when: (facts: LegalReadinessFacts) => boolean;
  then: (facts: LegalReadinessFacts) => Omit<LegalRuleResult, 'ruleCode'>;
}

export interface LegalReadinessResult extends SharedLegalReadinessResult {}
