import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ScoringService } from './scoring.service.js';
import { ConfigService } from '@nestjs/config';
import {
  CompetencyRequirement,
  TransferEdge,
  UserCompetencyState,
} from './scoring.types.js';

export interface AnalysisProgressUpdate {
  step: string;
  progressPercent: number;
}

export interface MarketConfidence {
  level: 'HIGH' | 'LOW' | 'CRITICAL';
  lowVolumeDetected: boolean;
  warning: string | null;
  totalVacancies: number;
  lowVolumeThreshold: number;
  criticalVolumeThreshold: number;
}

@Injectable()
export class AnalysisWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
    private readonly config: ConfigService,
  ) {}

  async executeAnalysis(
    profileId: string,
    userId: string,
    onProgress?: (update: AnalysisProgressUpdate) => Promise<void> | void,
  ) {
    await this.reportProgress(onProgress, 'LOAD_PROFILE', 10);
    const profile = await this.prisma.relocationProfile.findFirst({
      where: { id: profileId, userId },
      include: { competencies: { include: { competency: true } } },
    });
    if (!profile) throw new NotFoundException('Profile not found');

    await this.reportProgress(onProgress, 'LOAD_REQUIREMENTS', 25);
    const requirementsRaw = await this.prisma.marketRequirement.findMany({
      where: {
        countryCode: profile.targetCountry,
        roleName: profile.desiredRole,
        isActive: true,
      },
      include: { competency: true },
    });
    if (requirementsRaw.length === 0) {
      throw new NotFoundException(
        `No market requirements for ${profile.desiredRole} in ${profile.targetCountry}`,
      );
    }

    await this.reportProgress(onProgress, 'LOAD_MARKET_SNAPSHOT', 35);
    let snapshot = await this.prisma.marketSnapshot.findFirst({
      where: { country: profile.targetCountry },
      orderBy: { snapshotDate: 'desc' },
    });
    if (!snapshot) {
      snapshot = await this.prisma.marketSnapshot.create({
        data: {
          country: profile.targetCountry,
          city: profile.targetCity ?? null,
          snapshotDate: new Date(),
          source: 'requirements-baseline',
          totalVacancies: 0,
        },
      });
    }

    const confidence = this.computeMarketConfidence(snapshot.totalVacancies);
    const blockOnCriticalLowVolume =
      String(this.config.get('ANALYSIS_BLOCK_ON_CRITICAL_LOW_VOLUME') ?? 'false').toLowerCase() ===
      'true';
    if (blockOnCriticalLowVolume && confidence.level === 'CRITICAL') {
      throw new NotFoundException(
        `Analysis blocked: market snapshot is critically sparse (${snapshot.totalVacancies} vacancies).`,
      );
    }

    await this.reportProgress(onProgress, 'PREPARE_INPUTS', 50);
    const requirements: CompetencyRequirement[] = requirementsRaw.map((x) => ({
      id: x.id,
      competencyId: x.competencyId,
      competencyName: x.competency.name,
      competencyType: x.competencyType as any,
      competencyFamily: x.competency.family,
      priority: x.priority as any,
      roleRelevance: x.roleRelevance as any,
      frequency: Number(x.frequency),
      importance: Number(x.importance),
      hardSkillRequiredLevel: x.hardSkillRequiredLevel as any,
      languageRequiredLevel: x.languageRequiredLevel as any,
      certificationRequirementLevel: x.certificationRequirementLevel as any,
      requiredCertificationStatus: x.requiredCertificationStatus as any,
      languageContext: x.languageContext as any,
    }));

    const userCompetencies: UserCompetencyState[] = profile.competencies.map((x) => ({
      competencyId: x.competencyId,
      competencyType: x.competency.type as any,
      hardSkillLevel: x.hardSkillLevel as any,
      languageLevel: x.languageLevel as any,
      certificationStatus: x.certificationStatus as any,
    }));

    const countryLangRows = await this.prisma.countryLanguage.findMany({
      where: { countryCode: profile.targetCountry },
    });
    const countryLanguageRelevance = new Map<string, string>(
      countryLangRows.map((x) => [x.languageCompetencyId, x.relevance]),
    );

    const effortRows = await this.prisma.learningEffortProfile.findMany({
      where: {
        competencyId: { in: requirements.map((x) => x.competencyId) },
      },
    });
    const effortProfiles = new Map<string, Map<string, number>>();
    for (const row of effortRows) {
      const map = effortProfiles.get(row.competencyId) ?? new Map<string, number>();
      map.set(row.targetLevel, row.estimatedHours);
      effortProfiles.set(row.competencyId, map);
    }

    const competencies = await this.prisma.competency.findMany({
      where: { legacySkillId: { not: null } },
      select: { id: true, legacySkillId: true },
    });
    const competencyByLegacySkill = new Map<string, string>();
    for (const c of competencies) {
      if (c.legacySkillId) competencyByLegacySkill.set(c.legacySkillId, c.id);
    }

    const transfersRaw = await this.prisma.skillTransferability.findMany();
    const transferEdges: TransferEdge[] = [];
    for (const t of transfersRaw) {
      const sourceComp = competencyByLegacySkill.get(t.sourceSkillId);
      const targetComp = competencyByLegacySkill.get(t.targetSkillId);
      if (!sourceComp || !targetComp) continue;
      transferEdges.push({
        sourceCompetencyId: sourceComp,
        targetCompetencyId: targetComp,
        coefficient: Number(t.coefficient),
      });
    }

    await this.reportProgress(onProgress, 'COMPUTE_ANALYSIS', 70);
    const computed = this.scoring.computeAnalysis({
      requirements,
      userCompetencies,
      transferEdges,
      countryLanguageRelevance,
      effortProfiles,
      weeklyHours: 8,
    });

    await this.reportProgress(onProgress, 'SAVE_RESULTS', 90);
    const analysis = await this.prisma.analysisResult.create({
      data: {
        profileId: profile.id,
        snapshotId: snapshot.id,
        fitScore: computed.fitScore,
        skillBreakdown: computed.fitScoreContributors as any,
        totalPrepMonths: computed.totalPrepMonths,
        timeEstimate: computed.timeEstimate as any,
        analysisItems: {
          create: computed.analysisItems.map((item) => ({
            competencyId: item.competency.id,
            currentDisplayLevel: item.currentLevel,
            requiredDisplayLevel: item.requiredLevel,
            normalizedCurrentScore: item.normalizedCurrentScore,
            normalizedRequiredScore: item.normalizedRequiredScore,
            matchScore: item.matchScore,
            priority: item.priority as any,
            roleRelevance: item.roleRelevance as any,
            recommendationType: item.recommendationType as any,
            includedInRoadmap: item.includedInRoadmap,
            reason: item.reason,
            weight: item.weight,
          })),
        },
        roadmapSteps: {
          create: computed.roadmapSteps.map((step) => ({
            competencyId: step.competencyId,
            orderIndex: step.orderIndex,
            estimatedHours: step.estimatedHours,
            estimatedMonths: Math.round((step.estimatedHours / 8 / 4.3) * 10) / 10,
            dependsOn: step.dependsOn,
            priority: step.priority as any,
            roleRelevance: step.roleRelevance as any,
            recommendationType: step.recommendationType as any,
            currentDisplayLevel: step.currentDisplayLevel,
            requiredDisplayLevel: step.requiredDisplayLevel,
            reason: step.reason,
            status: step.status as any,
          })),
        },
      },
      include: {
        snapshot: true,
        analysisItems: { include: { competency: true } },
        roadmapSteps: { include: { competency: true }, orderBy: { orderIndex: 'asc' } },
      },
    });

    await this.reportProgress(onProgress, 'COMPLETED', 100);
    return this.formatAnalysisResponse(analysis);
  }

  formatAnalysisResponse(analysis: any) {
    const confidence = this.computeMarketConfidence(
      Number(analysis.snapshot?.totalVacancies ?? 0),
    );
    const analysisItems = analysis.analysisItems.map((item: any) => ({
      competency: {
        id: item.competency.id,
        name: item.competency.name,
        type: item.competency.type,
        family: item.competency.family,
      },
      priority: item.priority,
      roleRelevance: item.roleRelevance,
      currentLevel: item.currentDisplayLevel,
      requiredLevel: item.requiredDisplayLevel,
      normalizedCurrentScore: Number(item.normalizedCurrentScore),
      normalizedRequiredScore: Number(item.normalizedRequiredScore),
      matchScore: Number(item.matchScore),
      weight: Number(item.weight),
      recommendationType: item.recommendationType,
      includedInRoadmap: item.includedInRoadmap,
      reason: item.reason,
    }));

    const actionableGaps = analysisItems.filter(
      (x: any) => x.recommendationType === 'ACTIONABLE_GAP',
    );
    const marketContext = analysisItems.filter(
      (x: any) => x.recommendationType !== 'ACTIONABLE_GAP',
    );
    const fitScoreContributors = [...analysisItems]
      .sort((a: any, b: any) => b.weight - a.weight)
      .map((x: any) => ({
        competencyId: x.competency.id,
        competencyName: x.competency.name,
        matchScore: x.matchScore,
        weight: x.weight,
        recommendationType: x.recommendationType,
        reason: x.reason,
      }));

    return {
      id: analysis.id,
      fitScore: Number(analysis.fitScore),
      totalPrepMonths: Number(analysis.totalPrepMonths),
      timeEstimate: (analysis.timeEstimate as any) ?? null,
      createdAt: analysis.createdAt,
      snapshotMetadata: analysis.snapshot
        ? {
            id: analysis.snapshot.id,
            country: analysis.snapshot.country,
            city: analysis.snapshot.city,
            snapshotDate: analysis.snapshot.snapshotDate,
            source: analysis.snapshot.source,
            totalVacancies: analysis.snapshot.totalVacancies,
          }
        : null,
      marketConfidence: confidence,
      analysisItems,
      fitScoreContributors,
      actionableGaps,
      marketContext,
      roadmapSteps: analysis.roadmapSteps.map((step: any) => ({
        id: step.id,
        competencyId: step.competencyId,
        competencyName: step.competency.name,
        priority: step.priority,
        roleRelevance: step.roleRelevance,
        recommendationType: step.recommendationType,
        currentDisplayLevel: step.currentDisplayLevel,
        requiredDisplayLevel: step.requiredDisplayLevel,
        estimatedHours: step.estimatedHours,
        orderIndex: step.orderIndex,
        dependsOn: step.dependsOn,
        reason: step.reason,
        status: step.status,
      })),
    };
  }

  private async reportProgress(
    onProgress: ((update: AnalysisProgressUpdate) => Promise<void> | void) | undefined,
    step: string,
    progressPercent: number,
  ) {
    if (!onProgress) return;
    await onProgress({ step, progressPercent });
    const delayMs = Number(this.config.get('ANALYSIS_STEP_DELAY_MS') ?? 0);
    if (Number.isFinite(delayMs) && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  private computeMarketConfidence(totalVacanciesRaw: number): MarketConfidence {
    const totalVacancies = Number.isFinite(totalVacanciesRaw) ? totalVacanciesRaw : 0;
    const lowVolumeThreshold = Number(
      this.config.get('ANALYSIS_LOW_VOLUME_THRESHOLD') ?? 100,
    );
    const criticalVolumeThreshold = Number(
      this.config.get('ANALYSIS_CRITICAL_VOLUME_THRESHOLD') ?? 40,
    );

    if (totalVacancies < criticalVolumeThreshold) {
      return {
        level: 'CRITICAL',
        lowVolumeDetected: true,
        warning: `Critical confidence warning: only ${totalVacancies} vacancies in snapshot (threshold ${criticalVolumeThreshold}).`,
        totalVacancies,
        lowVolumeThreshold,
        criticalVolumeThreshold,
      };
    }

    if (totalVacancies < lowVolumeThreshold) {
      return {
        level: 'LOW',
        lowVolumeDetected: true,
        warning: `Low confidence warning: ${totalVacancies} vacancies in snapshot (threshold ${lowVolumeThreshold}).`,
        totalVacancies,
        lowVolumeThreshold,
        criticalVolumeThreshold,
      };
    }

    return {
      level: 'HIGH',
      lowVolumeDetected: false,
      warning: null,
      totalVacancies,
      lowVolumeThreshold,
      criticalVolumeThreshold,
    };
  }
}
