import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  CompareProfilesResponse,
  ComparedProfileResult,
  FinancialReadinessResult,
  LegalReadinessResult,
  ProfileComparisonCategoryResult,
  ProfileComparisonRecommendation,
} from '@reloplanner/shared-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { AnalysisWorkflowService } from '../scoring/analysis-workflow.service';
import { FinancialReadinessService } from '../financial-readiness/financial-readiness.service';
import { LegalReadinessService } from '../legal-readiness/legal-readiness.service';

type FormattedAnalysis = ReturnType<AnalysisWorkflowService['formatAnalysisResponse']>;

const LOW_CONFIDENCE_THRESHOLD = 40;

@Injectable()
export class ProfileComparisonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analysisWorkflow: AnalysisWorkflowService,
    private readonly financialReadiness: FinancialReadinessService,
    private readonly legalReadiness: LegalReadinessService,
  ) {}

  async compareProfiles(
    userId: string,
    firstProfileId: string,
    secondProfileId: string,
  ): Promise<CompareProfilesResponse> {
    if (!firstProfileId || !secondProfileId) {
      throw new BadRequestException('Both profiles must be selected');
    }
    if (firstProfileId === secondProfileId) {
      throw new BadRequestException('Selected profiles must be different');
    }

    const profiles = await this.prisma.relocationProfile.findMany({
      where: {
        userId,
        id: { in: [firstProfileId, secondProfileId] },
      },
    });
    if (profiles.length !== 2) {
      throw new BadRequestException(
        'Selected profiles must belong to current user',
      );
    }

    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    const firstProfile = profileById.get(firstProfileId)!;
    const secondProfile = profileById.get(secondProfileId)!;

    const [first, second] = await Promise.all([
      this.buildComparedProfile(firstProfile),
      this.buildComparedProfile(secondProfile),
    ]);

    const categoryResults = this.buildCategoryResults(first, second);
    const recommendationState = this.resolveWinner(first, second);
    const summary = this.buildSummary(
      recommendationState.recommendation,
      first,
      second,
      categoryResults,
    );

    return {
      firstProfile: first,
      secondProfile: second,
      winnerProfileId: recommendationState.winnerProfileId,
      recommendation: recommendationState.recommendation,
      summary,
      categoryResults,
      disclaimer:
        'This comparison is informational guidance only. It is based on available profile and analysis data and should not be treated as legal, financial, immigration, or employment advice.',
    };
  }

  private async buildComparedProfile(profile: any): Promise<ComparedProfileResult> {
    const [analysis, financial, legal] = await Promise.all([
      this.getLatestFormattedAnalysis(profile.id),
      this.getFinancialReadiness(profile),
      this.getLegalReadiness(profile),
    ]);

    let dataConfidenceScore = 100;

    const careerReadinessScore = this.toCareerReadinessScore(analysis);
    if (!analysis) dataConfidenceScore -= 20;

    const marketOpportunityScore = this.toMarketOpportunityScore(analysis);
    if (!analysis?.marketConfidence) dataConfidenceScore -= 20;

    const financialReadinessScore = this.toFinancialReadinessScore(financial);
    if (!financial) dataConfidenceScore -= 20;

    const immigrationSimplicityScore = this.toImmigrationSimplicityScore(legal);
    if (!legal) dataConfidenceScore -= 20;

    const preparationEffortScore = this.toPreparationEffortScore(analysis);
    if (!analysis) dataConfidenceScore -= 15;

    dataConfidenceScore = this.clamp(dataConfidenceScore, 0, 100);

    const overallScore = this.roundScore(
      careerReadinessScore * 0.3 +
        marketOpportunityScore * 0.25 +
        financialReadinessScore * 0.2 +
        immigrationSimplicityScore * 0.15 +
        preparationEffortScore * 0.1,
    );

    const strengths: string[] = [];
    const weaknesses: string[] = [];

    this.pushStrengthWeakness(
      strengths,
      weaknesses,
      careerReadinessScore,
      'Strong career readiness for the selected role.',
      'Career readiness appears weaker for this target direction.',
      70,
      45,
    );
    this.pushStrengthWeakness(
      strengths,
      weaknesses,
      marketOpportunityScore,
      'Market opportunity appears strong for this target direction.',
      'Market opportunity is currently limited for this target direction.',
      75,
      45,
    );
    this.pushStrengthWeakness(
      strengths,
      weaknesses,
      financialReadinessScore,
      'Financial readiness is currently stable for near-term relocation.',
      'Financial readiness is currently a major bottleneck.',
      70,
      40,
    );
    this.pushStrengthWeakness(
      strengths,
      weaknesses,
      immigrationSimplicityScore,
      'Immigration pathway appears comparatively less complex.',
      'Immigration/legal complexity is currently elevated.',
      70,
      45,
    );
    this.pushStrengthWeakness(
      strengths,
      weaknesses,
      preparationEffortScore,
      'Preparation effort appears manageable.',
      'Preparation effort remains high before relocation readiness.',
      70,
      45,
    );

    if (dataConfidenceScore < LOW_CONFIDENCE_THRESHOLD) {
      weaknesses.push(
        'Some analysis data is missing, so this comparison has lower confidence.',
      );
    }

    if (strengths.length === 0) {
      strengths.push('No clear standout strength identified from current data.');
    }
    if (weaknesses.length === 0) {
      weaknesses.push('No critical bottleneck identified from current data.');
    }

    const bestNextAction = this.resolveBestNextAction({
      careerReadinessScore,
      marketOpportunityScore,
      financialReadinessScore,
      immigrationSimplicityScore,
      preparationEffortScore,
    });

    return {
      profileId: profile.id,
      profileName: this.toProfileName(profile),
      sourceCountry: profile.currentCountry ?? null,
      targetCountry: profile.targetCountry ?? null,
      targetCity: profile.targetCity ?? null,
      targetRole: profile.desiredRole ?? null,
      overallScore,
      scores: {
        careerReadinessScore,
        marketOpportunityScore,
        financialReadinessScore,
        immigrationSimplicityScore,
        preparationEffortScore,
        dataConfidenceScore,
      },
      risks: {
        immigrationRisk: this.normalizeRisk(legal?.overallRisk),
        financialRisk: this.normalizeRisk(financial?.financialRiskLevel),
        marketConfidence: this.normalizeMarketConfidence(
          analysis?.marketConfidence?.level,
        ),
        overallRisk: this.resolveOverallRisk(analysis, financial, legal),
      },
      strengths,
      weaknesses,
      bestNextAction,
    };
  }

  private async getLatestFormattedAnalysis(
    profileId: string,
  ): Promise<FormattedAnalysis | null> {
    const analysis = await this.prisma.analysisResult.findFirst({
      where: { profileId },
      orderBy: { createdAt: 'desc' },
      include: {
        snapshot: true,
        analysisItems: { include: { competency: true } },
        roadmapSteps: {
          include: { competency: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });
    if (!analysis) return null;
    return this.analysisWorkflow.formatAnalysisResponse(analysis);
  }

  private async getFinancialReadiness(
    profile: any,
  ): Promise<FinancialReadinessResult | null> {
    try {
      return await this.financialReadiness.evaluate({
        targetCountry: profile.targetCountry,
        targetCity: profile.targetCity ?? undefined,
        savingsAmount:
          profile.savingsAmount != null ? Number(profile.savingsAmount) : undefined,
        savingsCurrency: profile.savingsCurrency ?? undefined,
        monthlyBudgetAmount:
          profile.monthlyBudgetAmount != null
            ? Number(profile.monthlyBudgetAmount)
            : undefined,
        monthlyBudgetCurrency: profile.monthlyBudgetCurrency ?? undefined,
        expectedNetSalaryAmount:
          profile.expectedNetSalaryAmount != null
            ? Number(profile.expectedNetSalaryAmount)
            : undefined,
        expectedNetSalaryCurrency: profile.expectedNetSalaryCurrency ?? undefined,
        dependentsCount: profile.dependentsCount ?? undefined,
        lifestyle: profile.lifestyle ?? undefined,
        jobSearchMonths: profile.jobSearchMonths ?? undefined,
      });
    } catch {
      return null;
    }
  }

  private async getLegalReadiness(
    profile: any,
  ): Promise<LegalReadinessResult | null> {
    try {
      return await this.legalReadiness.evaluate({
        sourceCountry: profile.currentCountry,
        targetCountry: profile.targetCountry,
        targetCity: profile.targetCity ?? undefined,
        desiredRole: profile.desiredRole ?? undefined,
        hasExistingWorkAuthorization:
          profile.hasExistingWorkAuthorization ?? undefined,
        hasJobOffer: profile.hasJobOffer ?? undefined,
        hasRecognizedDegree: profile.hasRecognizedDegree ?? undefined,
        hasFormalEducation: profile.hasFormalEducation ?? undefined,
        relocationWithFamily: profile.relocationWithFamily ?? undefined,
      });
    } catch {
      return null;
    }
  }

  private toCareerReadinessScore(analysis: FormattedAnalysis | null): number {
    if (!analysis) return 50;
    return this.roundScore(this.clamp(Number(analysis.fitScore) * 100, 0, 100));
  }

  private toMarketOpportunityScore(analysis: FormattedAnalysis | null): number {
    if (!analysis?.marketConfidence) return 50;

    let score = 50;
    const confidence = analysis.marketConfidence;
    if (confidence.level === 'HIGH') score = 85;
    else if (confidence.level === 'LOW') score = 35;
    else if (confidence.level === 'CRITICAL') score = 20;

    if (confidence.lowVolumeDetected) score -= 20;
    if (confidence.totalVacancies >= 1000) score += 10;
    if (confidence.totalVacancies < 100) score -= 15;

    return this.roundScore(this.clamp(score, 0, 100));
  }

  private toFinancialReadinessScore(
    financial: FinancialReadinessResult | null,
  ): number {
    if (!financial) return 50;

    if (typeof financial.runwayMonths === 'number') {
      const runway = financial.runwayMonths;
      if (runway >= 6) return 100;
      if (runway >= 4) return 75;
      if (runway >= 3) return 60;
      if (runway >= 1.5) return 35;
      if (runway >= 1) return 20;
      return 10;
    }

    if (financial.financialRiskLevel === 'LOW') return 80;
    if (financial.financialRiskLevel === 'MODERATE') return 50;
    if (financial.financialRiskLevel === 'HIGH') return 20;
    return 45;
  }

  private toImmigrationSimplicityScore(legal: LegalReadinessResult | null): number {
    if (!legal) return 50;

    let score = 100;
    if (legal.visaCheckLikelyRequired) score -= 35;
    if (legal.overallRisk === 'MODERATE') score -= 25;
    if (legal.overallRisk === 'HIGH') score -= 50;
    if (legal.warnings.some((warning) => warning.severity === 'HIGH')) score -= 15;
    return this.roundScore(this.clamp(score, 0, 100));
  }

  private toPreparationEffortScore(analysis: FormattedAnalysis | null): number {
    if (!analysis) return 50;

    let score = 100;
    const totalPrepMonths = Number(analysis.totalPrepMonths ?? 0);
    if (totalPrepMonths > 3) score -= 20;
    if (totalPrepMonths > 6) score -= 20;
    if (totalPrepMonths > 12) score -= 25;

    const realisticHours = Number(analysis.timeEstimate?.realisticHours ?? 0);
    if (realisticHours > 300) score -= 15;
    if (realisticHours > 600) score -= 15;
    if (realisticHours > 1000) score -= 20;

    return this.roundScore(this.clamp(score, 0, 100));
  }

  private buildCategoryResults(
    first: ComparedProfileResult,
    second: ComparedProfileResult,
  ): ProfileComparisonCategoryResult[] {
    return [
      this.toCategoryResult(
        'CAREER_READINESS',
        first,
        second,
        first.scores.careerReadinessScore,
        second.scores.careerReadinessScore,
        'Career readiness is based on fit score against current market requirements.',
      ),
      this.toCategoryResult(
        'MARKET_OPPORTUNITY',
        first,
        second,
        first.scores.marketOpportunityScore,
        second.scores.marketOpportunityScore,
        'Market opportunity reflects confidence and volume in available market data.',
      ),
      this.toCategoryResult(
        'FINANCIAL_READINESS',
        first,
        second,
        first.scores.financialReadinessScore,
        second.scores.financialReadinessScore,
        'Financial readiness is derived from runway and financial risk indicators.',
      ),
      this.toCategoryResult(
        'IMMIGRATION_SIMPLICITY',
        first,
        second,
        first.scores.immigrationSimplicityScore,
        second.scores.immigrationSimplicityScore,
        'Immigration simplicity reflects visa/legal complexity and warning severity.',
      ),
      this.toCategoryResult(
        'PREPARATION_EFFORT',
        first,
        second,
        first.scores.preparationEffortScore,
        second.scores.preparationEffortScore,
        'Preparation effort reflects estimated timeline and realistic workload.',
      ),
      this.toCategoryResult(
        'DATA_CONFIDENCE',
        first,
        second,
        first.scores.dataConfidenceScore,
        second.scores.dataConfidenceScore,
        'Data confidence decreases when key analysis blocks are unavailable.',
      ),
    ];
  }

  private toCategoryResult(
    category: ProfileComparisonCategoryResult['category'],
    first: ComparedProfileResult,
    second: ComparedProfileResult,
    firstProfileScore: number,
    secondProfileScore: number,
    explanation: string,
  ): ProfileComparisonCategoryResult {
    const diff = Math.abs(firstProfileScore - secondProfileScore);
    let betterProfileId: string | null = null;
    if (diff >= 2) {
      betterProfileId =
        firstProfileScore > secondProfileScore ? first.profileId : second.profileId;
    }
    return {
      category,
      firstProfileScore: this.roundScore(firstProfileScore),
      secondProfileScore: this.roundScore(secondProfileScore),
      betterProfileId,
      explanation,
    };
  }

  private resolveWinner(
    first: ComparedProfileResult,
    second: ComparedProfileResult,
  ): { winnerProfileId: string | null; recommendation: ProfileComparisonRecommendation } {
    if (
      first.scores.dataConfidenceScore < LOW_CONFIDENCE_THRESHOLD ||
      second.scores.dataConfidenceScore < LOW_CONFIDENCE_THRESHOLD
    ) {
      return {
        winnerProfileId: null,
        recommendation: 'INSUFFICIENT_DATA',
      };
    }

    const difference = Math.abs(first.overallScore - second.overallScore);
    if (difference < 5) {
      return {
        winnerProfileId: null,
        recommendation: 'SIMILAR_OPTIONS',
      };
    }
    if (first.overallScore > second.overallScore) {
      return {
        winnerProfileId: first.profileId,
        recommendation: 'FIRST_PROFILE_STRONGER',
      };
    }
    return {
      winnerProfileId: second.profileId,
      recommendation: 'SECOND_PROFILE_STRONGER',
    };
  }

  private buildSummary(
    recommendation: ProfileComparisonRecommendation,
    first: ComparedProfileResult,
    second: ComparedProfileResult,
    categories: ProfileComparisonCategoryResult[],
  ): string {
    if (recommendation === 'INSUFFICIENT_DATA') {
      return 'Some analysis data is missing, so this comparison has lower confidence.';
    }
    if (recommendation === 'SIMILAR_OPTIONS') {
      return 'Both profiles currently appear similar in overall readiness based on available analysis data.';
    }

    const winner =
      recommendation === 'FIRST_PROFILE_STRONGER' ? first : second;
    const loser = recommendation === 'FIRST_PROFILE_STRONGER' ? second : first;

    const winnerWins = categories
      .filter((category) => category.betterProfileId === winner.profileId)
      .map((category) => this.categoryLabel(category.category))
      .slice(0, 2);

    const loserBottleneck = categories
      .filter((category) => category.betterProfileId === winner.profileId)
      .sort(
        (a, b) =>
          Math.abs(b.firstProfileScore - b.secondProfileScore) -
          Math.abs(a.firstProfileScore - a.secondProfileScore),
      )
      .map((category) => this.categoryLabel(category.category))
      .at(0);

    const reason = winnerWins.length
      ? `stronger ${winnerWins.join(' and ').toLowerCase()}`
      : 'a higher overall readiness score';
    const weakness = loserBottleneck
      ? `, while ${this.displayProfileName(loser)} is weaker in ${loserBottleneck.toLowerCase()}`
      : '';

    return `${this.displayProfileName(winner)} currently appears stronger based on available analysis data due to ${reason}${weakness}.`;
  }

  private normalizeRisk(
    risk: string | null | undefined,
  ): 'LOW' | 'MODERATE' | 'HIGH' | null {
    if (risk === 'LOW' || risk === 'MODERATE' || risk === 'HIGH') return risk;
    return null;
  }

  private normalizeMarketConfidence(
    level: string | null | undefined,
  ): 'LOW' | 'MEDIUM' | 'HIGH' | null {
    if (level === 'HIGH') return 'HIGH';
    if (level === 'LOW') return 'MEDIUM';
    if (level === 'CRITICAL') return 'LOW';
    return null;
  }

  private resolveOverallRisk(
    analysis: FormattedAnalysis | null,
    financial: FinancialReadinessResult | null,
    legal: LegalReadinessResult | null,
  ): 'LOW' | 'MODERATE' | 'HIGH' | null {
    const risks: Array<'LOW' | 'MODERATE' | 'HIGH'> = [];

    const immigrationRisk = this.normalizeRisk(legal?.overallRisk);
    const financialRisk = this.normalizeRisk(financial?.financialRiskLevel);
    const market = this.normalizeMarketConfidence(analysis?.marketConfidence?.level);

    if (immigrationRisk) risks.push(immigrationRisk);
    if (financialRisk) risks.push(financialRisk);
    if (market === 'LOW') risks.push('HIGH');
    else if (market === 'MEDIUM') risks.push('MODERATE');
    else if (market === 'HIGH') risks.push('LOW');

    if (risks.length === 0) return null;
    if (risks.includes('HIGH')) return 'HIGH';
    if (risks.includes('MODERATE')) return 'MODERATE';
    return 'LOW';
  }

  private resolveBestNextAction(scores: {
    careerReadinessScore: number;
    marketOpportunityScore: number;
    financialReadinessScore: number;
    immigrationSimplicityScore: number;
    preparationEffortScore: number;
  }): string {
    const ordered = [
      { key: 'career', value: scores.careerReadinessScore },
      { key: 'market', value: scores.marketOpportunityScore },
      { key: 'financial', value: scores.financialReadinessScore },
      { key: 'immigration', value: scores.immigrationSimplicityScore },
      { key: 'preparation', value: scores.preparationEffortScore },
    ].sort((a, b) => a.value - b.value);

    const weakest = ordered[0]?.key;
    if (weakest === 'financial') {
      return 'Increase relocation runway and stabilize monthly budget before committing to this direction.';
    }
    if (weakest === 'immigration') {
      return 'Clarify visa/legal route prerequisites and address the highest-risk legal unknowns first.';
    }
    if (weakest === 'market') {
      return 'Broaden market targeting and validate vacancy volume before prioritizing this direction.';
    }
    if (weakest === 'preparation') {
      return 'Prioritize the shortest critical-path roadmap gaps to reduce preparation effort.';
    }
    return 'Focus on closing high-impact competency gaps, then rerun profile analysis.';
  }

  private pushStrengthWeakness(
    strengths: string[],
    weaknesses: string[],
    score: number,
    strengthText: string,
    weaknessText: string,
    strengthThreshold: number,
    weaknessThreshold: number,
  ) {
    if (score >= strengthThreshold) {
      strengths.push(strengthText);
    } else if (score < weaknessThreshold) {
      weaknesses.push(weaknessText);
    }
  }

  private categoryLabel(category: ProfileComparisonCategoryResult['category']) {
    switch (category) {
      case 'CAREER_READINESS':
        return 'Career readiness';
      case 'MARKET_OPPORTUNITY':
        return 'Market opportunity';
      case 'FINANCIAL_READINESS':
        return 'Financial readiness';
      case 'IMMIGRATION_SIMPLICITY':
        return 'Immigration simplicity';
      case 'PREPARATION_EFFORT':
        return 'Preparation effort';
      case 'DATA_CONFIDENCE':
        return 'Data confidence';
      default:
        return category;
    }
  }

  private toProfileName(profile: any): string {
    const role = typeof profile.desiredRole === 'string' ? profile.desiredRole : 'Profile';
    const country =
      typeof profile.targetCountry === 'string' ? profile.targetCountry : 'target';
    const city =
      typeof profile.targetCity === 'string' && profile.targetCity.trim().length > 0
        ? `, ${profile.targetCity}`
        : '';
    return `${role} -> ${country}${city}`;
  }

  private displayProfileName(profile: ComparedProfileResult) {
    return profile.profileName || `Profile ${profile.profileId.slice(0, 8)}`;
  }

  private clamp(value: number, min: number, max: number) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }

  private roundScore(value: number) {
    return Math.round(value * 10) / 10;
  }
}
