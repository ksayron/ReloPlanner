import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  Request,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service.js';
import { ScoringService } from './scoring.service.js';
import {
  CompetencyRequirement,
  TransferEdge,
  UserCompetencyState,
} from './scoring.types.js';

@Controller('profiles')
@UseGuards(AuthGuard('jwt'))
export class ScoringController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
  ) {}

  @Post(':id/analyze')
  async analyze(@Param('id') profileId: string, @Request() req: any) {
    const profile = await this.prisma.relocationProfile.findFirst({
      where: { id: profileId, userId: req.user.id },
      include: { competencies: { include: { competency: true } } },
    });
    if (!profile) throw new NotFoundException('Profile not found');

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

    const computed = this.scoring.computeAnalysis({
      requirements,
      userCompetencies,
      transferEdges,
      countryLanguageRelevance,
      effortProfiles,
      weeklyHours: 8,
    });

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
        analysisItems: { include: { competency: true } },
        roadmapSteps: { include: { competency: true }, orderBy: { orderIndex: 'asc' } },
      },
    });

    return this.formatAnalysisResponse(analysis);
  }

  @Get(':id/results')
  async getResults(@Param('id') profileId: string, @Request() req: any) {
    const profile = await this.prisma.relocationProfile.findFirst({
      where: { id: profileId, userId: req.user.id },
    });
    if (!profile) throw new NotFoundException('Profile not found');

    const analysis = await this.prisma.analysisResult.findFirst({
      where: { profileId },
      orderBy: { createdAt: 'desc' },
      include: {
        analysisItems: { include: { competency: true } },
        roadmapSteps: { include: { competency: true }, orderBy: { orderIndex: 'asc' } },
      },
    });
    if (!analysis) throw new NotFoundException('No analysis results found');

    return this.formatAnalysisResponse(analysis);
  }

  @Get(':id/roadmap')
  async getRoadmap(@Param('id') profileId: string, @Request() req: any) {
    const profile = await this.prisma.relocationProfile.findFirst({
      where: { id: profileId, userId: req.user.id },
    });
    if (!profile) throw new NotFoundException('Profile not found');

    const analysis = await this.prisma.analysisResult.findFirst({
      where: { profileId },
      orderBy: { createdAt: 'desc' },
      include: {
        roadmapSteps: { include: { competency: true }, orderBy: { orderIndex: 'asc' } },
      },
    });
    if (!analysis) throw new NotFoundException('No analysis results found');

    return {
      totalPrepMonths: Number(analysis.totalPrepMonths),
      timeEstimate: (analysis.timeEstimate as any) ?? null,
      steps: analysis.roadmapSteps.map((step) => ({
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

  private formatAnalysisResponse(analysis: any) {
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
}
