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
import { GapAnalysisService } from './gap-analysis.service.js';
import { RoadmapService } from './roadmap.service.js';
import { TransferEdge, SkillDemand, SkillMeta } from './scoring.types.js';

@Controller('profiles')
@UseGuards(AuthGuard('jwt'))
export class ScoringController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
    private readonly gapAnalysis: GapAnalysisService,
    private readonly roadmap: RoadmapService,
  ) {}

  @Post(':id/analyze')
  async analyze(@Param('id') profileId: string, @Request() req: any) {
    // Load profile with skills
    const profile = await this.prisma.relocationProfile.findFirst({
      where: { id: profileId, userId: req.user.id },
      include: { skills: { include: { skill: true } } },
    });
    if (!profile) throw new NotFoundException('Profile not found');

    // Find latest market snapshot for target country
    const snapshot = await this.prisma.marketSnapshot.findFirst({
      where: { country: profile.targetCountry },
      orderBy: { snapshotDate: 'desc' },
      include: { skillDemands: true },
    });
    if (!snapshot) throw new NotFoundException('No market data for target country');

    // Load transferability matrix
    const transfers = await this.prisma.skillTransferability.findMany();
    const transferMatrix = new Map<string, TransferEdge[]>();
    for (const t of transfers) {
      const edges = transferMatrix.get(t.sourceSkillId) || [];
      edges.push({ targetId: t.targetSkillId, coefficient: Number(t.coefficient) });
      transferMatrix.set(t.sourceSkillId, edges);
    }

    // Build user skill vector
    const userVec = new Map<string, number>();
    const originalUserSkills = new Set<string>();
    for (const us of profile.skills) {
      userVec.set(us.skillId, Number(us.proficiency));
      originalUserSkills.add(us.skillId);
    }

    // Build demand vector
    const demandVec = new Map<string, SkillDemand>();
    for (const d of snapshot.skillDemands) {
      demandVec.set(d.skillId, {
        frequency: Number(d.frequency),
        requiredLevel: Number(d.avgRequiredLevel),
      });
    }

    // Run algorithms
    const expanded = this.scoring.expandSkillVector(userVec, transferMatrix);
    const fitResult = this.scoring.computeFitScore(expanded, demandVec, originalUserSkills);

    // Load skill metadata for gap analysis
    const allSkills = await this.prisma.skill.findMany();
    const skillMeta = new Map<string, SkillMeta>();
    for (const s of allSkills) {
      skillMeta.set(s.id, { category: s.category, parentId: s.parentId });
    }

    const gaps = this.gapAnalysis.analyzeGaps(fitResult.breakdown, skillMeta);

    // Build parent map for roadmap
    const parentMap = new Map<string, string | null>();
    for (const s of allSkills) {
      parentMap.set(s.id, s.parentId);
    }

    const roadmapResult = this.roadmap.buildRoadmap(gaps, parentMap);

    // Persist results
    const analysis = await this.prisma.analysisResult.create({
      data: {
        profileId,
        snapshotId: snapshot.id,
        fitScore: fitResult.score,
        skillBreakdown: fitResult.breakdown as any,
        totalPrepMonths: roadmapResult.totalPrepMonths,
        gaps: {
          create: roadmapResult.orderedGaps.map((g) => ({
            id: g.id,
            skillId: g.skillId,
            gapType: g.gapType,
            severity: g.severity,
            currentLevel: g.currentLevel,
            requiredLevel: g.requiredLevel,
            estimatedMonths: g.estimatedMonths,
            dependsOn: g.dependsOn,
            orderIndex: g.orderIndex,
          })),
        },
      },
      include: { gaps: { orderBy: { orderIndex: 'asc' } } },
    });

    return analysis;
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
      include: { gaps: { orderBy: { orderIndex: 'asc' }, include: { skill: true } } },
    });
    if (!analysis) throw new NotFoundException('No analysis results found');

    return analysis;
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
      include: { gaps: { orderBy: { orderIndex: 'asc' }, include: { skill: true } } },
    });
    if (!analysis) throw new NotFoundException('No analysis results found');

    return {
      totalPrepMonths: analysis.totalPrepMonths,
      gaps: analysis.gaps,
    };
  }
}
