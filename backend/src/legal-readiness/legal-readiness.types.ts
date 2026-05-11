export type RegionType = 'EU' | 'NON_EU' | 'UNKNOWN';

export type LegalRiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'UNKNOWN';

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

export interface LegalQuestion {
  key: string;
  text: string;
  type: LegalQuestionType;
  priority: LegalQuestionPriority;
}

export interface LegalRoute {
  code: string;
  title: string;
  applicability: LegalRouteApplicability;
  description: string;
}

export interface LegalWarning {
  code: string;
  severity: LegalWarningSeverity;
  message: string;
}

export interface LegalAdvice {
  code: string;
  message: string;
}

export interface TriggeredLegalRule {
  code: string;
  description: string;
}

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

export interface LegalReadinessResult {
  sourceCountry: string;
  targetCountry: string;
  sourceRegion: RegionType;
  targetRegion: RegionType;
  visaCheckLikelyRequired: boolean;
  overallRisk: LegalRiskLevel;
  triggeredRules: TriggeredLegalRule[];
  questions: LegalQuestion[];
  possibleRoutes: LegalRoute[];
  warnings: LegalWarning[];
  advice: LegalAdvice[];
  recommendedArticleSlugs: string[];
  disclaimer: string;
}
