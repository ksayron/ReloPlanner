export type Role = 'USER' | 'PREMIUM' | 'ADMIN';
export type GapStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
export type SkillCategory = 'HARD_SKILL' | 'LANGUAGE' | 'CERTIFICATION' | 'SOFT_SKILL';
export type CostCategory = 'RENT' | 'FOOD' | 'TRANSPORT' | 'UTILITIES' | 'OTHER';
export type KnowledgeCategory =
  | 'VISA'
  | 'LEGAL'
  | 'COST'
  | 'JOB'
  | 'CV'
  | 'LANGUAGE'
  | 'HOUSING';

export type CompetencyType =
  | 'HARD_SKILL'
  | 'LANGUAGE'
  | 'CERTIFICATION'
  | 'DOMAIN_KNOWLEDGE'
  | 'SOFT_SKILL';

export type RequirementPriority = 'CORE' | 'IMPORTANT' | 'OPTIONAL' | 'CONTEXTUAL';
export type RoleRelevance = 'CORE' | 'RELATED' | 'WEAKLY_RELATED' | 'IRRELEVANT';
export type RecommendationType =
  | 'ACTIONABLE_GAP'
  | 'OPTIONAL_IMPROVEMENT'
  | 'MARKET_CONTEXT'
  | 'EXCLUDED_AS_IRRELEVANT';

export type HardSkillLevel = 'NONE' | 'BASIC' | 'PRACTICAL' | 'CONFIDENT' | 'ADVANCED';
export type LanguageLevel = 'NONE' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type CertificationStatus = 'NONE' | 'PLANNED' | 'IN_PROGRESS' | 'OBTAINED' | 'EXPIRED';

export interface User {
  id: string;
  email: string;
  role: Role;
}

export interface AuthPayload {
  access_token: string;
}

export interface Competency {
  id: string;
  name: string;
  type: CompetencyType;
  family?: string | null;
  parentId?: string | null;
}

export interface Skill {
  id: string;
  name: string;
  category: SkillCategory;
  parentId?: string | null;
  children?: Skill[];
  aliases?: { id: string; alias: string }[];
}

export interface UserCompetencyInput {
  competencyId: string;
  hardSkillLevel?: HardSkillLevel;
  languageLevel?: LanguageLevel;
  certificationStatus?: CertificationStatus;
}

export interface RelocationProfile {
  id: string;
  targetCountry: string;
  targetCity?: string;
  currentCountry: string;
  yearsExperience: number;
  desiredRole: string;
  competencies?: UserCompetencyInput[];
}

export interface AnalysisItem {
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
}

export interface FitContributor {
  competencyId: string;
  competencyName: string;
  matchScore: number;
  weight: number;
  recommendationType: RecommendationType;
  reason: string;
}

export interface RoadmapStep {
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

export interface SkillMatchResult {
  skillId: string;
  matchScore: number;
  weight: number;
  userLevel: number;
  requiredLevel: number;
  source: 'direct' | 'transferability';
}

export interface GapItem {
  id: string;
  skillId: string;
  gapType: 'HARD_SKILL' | 'LANGUAGE' | 'CERTIFICATION' | 'EXPERIENCE';
  severity: 'CRITICAL' | 'MODERATE' | 'MINOR' | 'HIGH';
  currentLevel: number;
  requiredLevel: number;
  estimatedMonths: number;
  dependsOn: string[];
  orderIndex: number;
  status: GapStatus;
  skill?: Skill;
}

export interface TimeEstimate {
  optimisticHours: number;
  realisticHours: number;
  criticalPathHours: number;
}

export interface AnalysisResult {
  id: string;
  fitScore: number;
  totalPrepMonths: number;
  timeEstimate: TimeEstimate | null;
  createdAt: string;
  snapshotMetadata: {
    id: string;
    country: string;
    city: string | null;
    snapshotDate: string;
    source: string;
    totalVacancies: number;
  } | null;
  marketConfidence: {
    level: 'HIGH' | 'LOW' | 'CRITICAL';
    lowVolumeDetected: boolean;
    warning: string | null;
    totalVacancies: number;
    lowVolumeThreshold: number;
    criticalVolumeThreshold: number;
  };
  analysisItems: AnalysisItem[];
  fitScoreContributors: FitContributor[];
  actionableGaps: AnalysisItem[];
  marketContext: AnalysisItem[];
  roadmapSteps: RoadmapStep[];
}

export interface AnalysisHistoryItem {
  id: string;
  createdAt: string;
  fitScore: number;
  totalPrepMonths: number;
  snapshotMetadata: {
    id: string;
    country: string;
    city: string | null;
    snapshotDate: string;
    source: string;
    totalVacancies: number;
  } | null;
}

export interface CostComparison {
  city1: string;
  city2: string;
  comparison: { category: CostCategory; city1Amount: number; city2Amount: number }[];
}

export interface KnowledgeArticleListItem {
  slug: string;
  title: string;
  country: string;
  category: KnowledgeCategory;
  language: string;
  excerpt: string;
  topicTags: string[];
  riskTags: string[];
  updatedAt: string;
}

export interface KnowledgeArticleDetail {
  slug: string;
  title: string;
  country: string;
  category: KnowledgeCategory;
  language: string;
  content: string;
  topicTags: string[];
  riskTags: string[];
  updatedAt: string;
}

export interface KnowledgeListResponse {
  items: KnowledgeArticleListItem[];
  filters: {
    country: string | null;
    category: KnowledgeCategory | null;
    language: string;
  };
  total: number;
}

export interface CountryOption {
  code: string;
  name: string;
  suggestedCities?: string[];
}

export interface CountriesCatalog {
  target: CountryOption[];
  source: CountryOption[];
}

export type ProcessingJobType =
  | 'PROFILE_ANALYSIS'
  | 'MARKET_SYNC'
  | 'REPORT_GENERATION'
  | 'RESUME_PROFILE_PARSE';
export type ProcessingJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface ProcessingJobSnapshot {
  id: string;
  type: ProcessingJobType;
  status: ProcessingJobStatus;
  currentStep: string;
  progressPercent: number;
  errorMessage: string | null;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeDraftField<T> {
  value: T | null;
  confidence: number;
}

export interface ResumeMappedCompetency {
  competencyId: string;
  competencyName: string;
  competencyType: CompetencyType;
  confidence: number;
  hardSkillLevel?: HardSkillLevel;
  languageLevel?: LanguageLevel;
  certificationStatus?: CertificationStatus;
}

export interface ResumeProfileDraft {
  desiredRole: ResumeDraftField<string>;
  yearsExperience: ResumeDraftField<number>;
  currentCountry: ResumeDraftField<string>;
  competencies: ResumeMappedCompetency[];
  unmatchedSkills: Array<{ name: string; confidence: number }>;
  overallConfidence: number;
}

export interface JobPosting {
  id: string;
  countryCode: string;
  roleName: string;
  title: string;
  company: string;
  location: string;
  source: string;
  sourceUrl: string | null;
  salaryMinUsd: number | null;
  salaryMaxUsd: number | null;
  salaryCurrency: string | null;
  requirements: string[];
  createdAt: string;
}

export interface JobMatchResult {
  posting: JobPosting;
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  rationale: string;
}

export type ReportVariant = 'snapshot' | 'ai-summary';
export type AiProviderName = 'OPENAI' | 'OPENROUTER' | 'MOCK';
export type AiTaskGrade = 'EASY' | 'REASONING';

export type RegionType = 'EU' | 'NON_EU' | 'UNKNOWN';
export type LegalRiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'UNKNOWN';

export interface LegalQuestion {
  key: string;
  text: string;
  type: 'BOOLEAN';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface LegalRoute {
  code: string;
  title: string;
  applicability: 'POSSIBLE' | 'LESS_LIKELY' | 'UNKNOWN';
  description: string;
}

export interface LegalWarning {
  code: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
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

export interface ReportAiSummary {
  executiveSummary: string;
  topStrengths: string[];
  topRisks: string[];
  recommendedStrategy: string;
  advisoryDisclaimer: string;
}

export interface ReportAiSummaryMeta {
  grade: AiTaskGrade;
  requestedProvider: AiProviderName;
  attemptedProviders: AiProviderName[];
  providerUsed: AiProviderName;
  fallbackUsed: boolean;
  modelUsed: string;
  failureReasons: Partial<Record<AiProviderName, string>>;
}

export interface ReportSnapshotResponse {
  generation: {
    status: 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';
    startedAt: string;
    completedAt: string | null;
    error: string | null;
  };
  snapshot: {
    reportType: 'RELOCATION_READINESS_REPORT';
    analysisId: string;
    generatedAt: string;
    profileSummary: {
      profileId: string;
      targetCountry: string;
      targetCity: string | null;
      currentCountry: string;
      yearsExperience: number;
      desiredRole: string;
    };
    readiness: {
      fitScore: number;
      readinessLevel: 'READY' | 'NEAR_READY' | 'PREPARATION_REQUIRED';
      totalPrepMonths: number;
    };
    legalReadiness?: LegalReadinessResult;
  };
  variant: ReportVariant;
  aiSummary: ReportAiSummary | null;
  aiSummaryMeta: ReportAiSummaryMeta | null;
}

export interface AiRoutingPolicyResponse {
  defaults: Record<AiTaskGrade, AiProviderName>;
  orders: Record<AiTaskGrade, AiProviderName[]>;
  availableProviders: AiProviderName[];
}
