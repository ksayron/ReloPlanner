import type {
  CertificationStatus as SharedCertificationStatus,
  CompetencyType as SharedCompetencyType,
  GapStatus as SharedGapStatus,
  HardSkillLevel as SharedHardSkillLevel,
  LanguageLevel as SharedLanguageLevel,
  RecommendationType as SharedRecommendationType,
  RequirementPriority as SharedRequirementPriority,
  RoleRelevance as SharedRoleRelevance,
} from '@reloplanner/shared-contracts';

export type CompetencyType = SharedCompetencyType;

export type RequirementPriority = SharedRequirementPriority;
export type RoleRelevance = SharedRoleRelevance;
export type RecommendationType = SharedRecommendationType;

export type GapStatus = SharedGapStatus;

export type HardSkillLevel = SharedHardSkillLevel;
export type LanguageLevel = SharedLanguageLevel;
export type CertificationStatus = SharedCertificationStatus;

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
