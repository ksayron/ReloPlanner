export type CompetencyType =
  | 'HARD_SKILL'
  | 'LANGUAGE'
  | 'CERTIFICATION'
  | 'DOMAIN_KNOWLEDGE'
  | 'SOFT_SKILL';

export type RequirementPriority =
  | 'CORE'
  | 'IMPORTANT'
  | 'OPTIONAL'
  | 'CONTEXTUAL';
export type RoleRelevance =
  | 'CORE'
  | 'RELATED'
  | 'WEAKLY_RELATED'
  | 'IRRELEVANT';
export type RecommendationType =
  | 'ACTIONABLE_GAP'
  | 'OPTIONAL_IMPROVEMENT'
  | 'MARKET_CONTEXT'
  | 'EXCLUDED_AS_IRRELEVANT';

export type GapStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export type HardSkillLevel =
  | 'NONE'
  | 'BASIC'
  | 'PRACTICAL'
  | 'CONFIDENT'
  | 'ADVANCED';
export type LanguageLevel = 'NONE' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type CertificationStatus =
  | 'NONE'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'OBTAINED'
  | 'EXPIRED';

export interface CompetencyRequirement {
  id: string;
  competencyId: string;
  competencyName: string;
  competencyType: CompetencyType;
  competencyFamily: string | null;
  priority: RequirementPriority;
  roleRelevance: RoleRelevance;
  frequency: number;
  importance: number;
  hardSkillRequiredLevel?: HardSkillLevel | null;
  languageRequiredLevel?: LanguageLevel | null;
  certificationRequirementLevel?: 'OPTIONAL' | 'PREFERRED' | 'REQUIRED' | null;
  requiredCertificationStatus?: CertificationStatus | null;
  languageContext?:
    | 'JOB_MARKET'
    | 'RELOCATION_ADAPTATION'
    | 'LEGAL_OR_ADMIN'
    | 'OPTIONAL_ADVANTAGE'
    | null;
}

export interface UserCompetencyState {
  competencyId: string;
  competencyType: CompetencyType;
  hardSkillLevel?: HardSkillLevel | null;
  languageLevel?: LanguageLevel | null;
  certificationStatus?: CertificationStatus | null;
}

export interface AnalysisItemResult {
  competency: {
    id: string;
    name: string;
    type: CompetencyType;
    family: string | null;
  };
  priority: RequirementPriority;
  roleRelevance: RoleRelevance;
  currentLevel: string;
  requiredLevel: string;
  normalizedCurrentScore: number;
  normalizedRequiredScore: number;
  matchScore: number;
  weight: number;
  recommendationType: RecommendationType;
  includedInRoadmap: boolean;
  reason: string;
  severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'MINOR';
  estimatedHours: number;
  estimatedMonths: number;
  dependsOnCompetencyIds: string[];
}

export interface FitContributor {
  competencyId: string;
  competencyName: string;
  matchScore: number;
  weight: number;
  recommendationType: RecommendationType;
  reason: string;
}

export interface TimeEstimate {
  optimisticHours: number;
  realisticHours: number;
  criticalPathHours: number;
}

export interface RoadmapStepResult {
  id: string;
  competencyId: string;
  competencyName: string;
  priority: RequirementPriority;
  roleRelevance: RoleRelevance;
  recommendationType: RecommendationType;
  currentDisplayLevel: string;
  requiredDisplayLevel: string;
  estimatedHours: number;
  orderIndex: number;
  dependsOn: string[];
  reason: string;
  status: GapStatus;
}

export interface AnalysisComputationResult {
  fitScore: number;
  analysisItems: AnalysisItemResult[];
  fitScoreContributors: FitContributor[];
  actionableGaps: AnalysisItemResult[];
  marketContext: AnalysisItemResult[];
  roadmapSteps: RoadmapStepResult[];
  totalPrepMonths: number;
  timeEstimate: TimeEstimate;
}

export interface TransferEdge {
  sourceCompetencyId: string;
  targetCompetencyId: string;
  coefficient: number;
}
