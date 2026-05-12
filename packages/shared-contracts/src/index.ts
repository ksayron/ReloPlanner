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
export type KnowledgeAccessLevel = 'FREE' | 'PREMIUM';

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
export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'PLN' | 'UAH';
export type LifestyleProfile = 'FRUGAL' | 'STANDARD' | 'COMFORTABLE';

export interface User {
  id: string;
  email: string;
  displayName?: string | null;
  role: Role;
}

export type PreferredLanguage = 'en' | 'ru';
export type PreferredTheme = 'light' | 'dark';

export interface UserPreferences {
  preferredLanguage: PreferredLanguage;
  preferredTheme: PreferredTheme;
  preferredCurrency: CurrencyCode;
  defaultTargetCountry: string | null;
  defaultTargetCity: string | null;
  weeklyStudyHours: number;
  preferredReportLanguage: PreferredLanguage;
  createdAt: string;
  updatedAt: string;
}

export type UpdateUserPreferencesPayload = Partial<{
  preferredLanguage: PreferredLanguage;
  preferredTheme: PreferredTheme;
  preferredCurrency: CurrencyCode;
  defaultTargetCountry: string | null;
  defaultTargetCity: string | null;
  weeklyStudyHours: number;
  preferredReportLanguage: PreferredLanguage;
}>;

export type BillingPlanCode = 'FREE' | 'PREMIUM';

export interface BillingFeatureState {
  enabled: boolean;
  limit: number | null;
}

export interface BillingStatusResponse {
  plan: {
    code: BillingPlanCode;
    name: string;
  };
  subscription: {
    id: string;
    status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'CANCELED';
    startedAt: string;
    expiresAt: string | null;
    provider: 'STRIPE';
  };
  payments: Array<{
    id: string;
    status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';
    amount: number;
    currency: CurrencyCode;
    planCode: BillingPlanCode;
    createdAt: string;
    errorCode: string | null;
    errorMessage: string | null;
  }>;
  entitlements: {
    planCode: BillingPlanCode;
    features: Record<string, BillingFeatureState>;
  };
}

export interface BillingPlanSummaryResponse {
  plan: BillingStatusResponse['plan'];
  subscription: BillingStatusResponse['subscription'];
  payments: BillingStatusResponse['payments'];
  entitlements: BillingStatusResponse['entitlements'];
  preferredCurrency: CurrencyCode;
  premiumPricing: {
    stripePriceId: string | null;
    basePriceUsd: number;
    convertedPrice: number;
    convertedCurrency: CurrencyCode;
  };
  stripe: {
    mode: 'SIMULATED' | 'LIVE';
    subscription: {
      id: string;
      status: string;
      cancelAtPeriodEnd: boolean;
      currentPeriodEnd: string | null;
      canceledAt: string | null;
      latestInvoice: {
        id: string;
        status?: string | null;
        paid?: boolean | null;
        hostedInvoiceUrl?: string | null;
      } | null;
    } | null;
  };
}

export interface CheckoutStartResponse {
  paymentId: string;
  provider: 'STRIPE';
  mode: 'SIMULATED' | 'LIVE';
  checkoutSessionId: string;
  checkoutUrl: string | null;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';
  amount: number;
  currency: CurrencyCode;
}

export interface CheckoutResolveResponse {
  checkoutSessionId: string;
  paymentStatus: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';
  subscriptionStatus: 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'CANCELED';
  planCode: BillingPlanCode;
  errorCode?: string | null;
  errorMessage?: string | null;
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
  targetCity?: string | null;
  currentCountry: string;
  yearsExperience: number;
  desiredRole: string;
  savingsAmount?: number | null;
  savingsCurrency?: CurrencyCode | null;
  monthlyBudgetAmount?: number | null;
  monthlyBudgetCurrency?: CurrencyCode | null;
  expectedNetSalaryAmount?: number | null;
  expectedNetSalaryCurrency?: CurrencyCode | null;
  dependentsCount?: number | null;
  lifestyle?: LifestyleProfile | null;
  jobSearchMonths?: number | null;
  hasExistingWorkAuthorization?: boolean | null;
  hasJobOffer?: boolean | null;
  hasRecognizedDegree?: boolean | null;
  hasFormalEducation?: boolean | null;
  relocationWithFamily?: boolean | null;
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
  accessLevel: KnowledgeAccessLevel;
  isLocked: boolean;
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
  accessLevel: KnowledgeAccessLevel;
  isLocked: boolean;
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
  access?: {
    planCode: 'FREE' | 'PREMIUM';
  };
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

export interface TopMatchesResponse {
  items: JobMatchResult[];
  limit: number;
  access: {
    requestedLimit: number;
    maxAllowedLimit: number | null;
    upgradeRequired: boolean;
  };
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

export type FinancialRiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'UNKNOWN';
export type CostEstimateSource = 'CITY' | 'COUNTRY' | 'GLOBAL';

export interface FinancialCostCategoryEstimate {
  category: CostCategory;
  monthlyAmountUsd: number;
}

export interface FinancialCostEstimate {
  source: CostEstimateSource;
  categories: FinancialCostCategoryEstimate[];
  totalMonthlyEstimateUsd: number;
  appliedLifestyleMultiplier: number;
  appliedDependentsMultiplier: number;
}

export interface FinancialWarning {
  code: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  message: string;
}

export interface FinancialAdvice {
  code: string;
  message: string;
}

export interface TriggeredFinancialRule {
  code: string;
  description: string;
}

export interface FinancialReadinessResult {
  targetCountry: string;
  targetCity: string | null;
  financialRiskLevel: FinancialRiskLevel;
  runwayMonths: number | null;
  recommendedSavingsAmount: number;
  recommendedSavingsCurrency: 'USD';
  costEstimate: FinancialCostEstimate;
  triggeredRules: TriggeredFinancialRule[];
  warnings: FinancialWarning[];
  advice: FinancialAdvice[];
  summary: string;
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
    financialReadiness?: FinancialReadinessResult;
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
