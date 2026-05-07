import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service.js';
import { AnalysisWorkflowService } from './analysis-workflow.service.js';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@Controller('profiles')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Analysis')
@ApiBearerAuth()
export class ScoringController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analysisWorkflow: AnalysisWorkflowService,
  ) {}

  @Post(':id/analyze')
  async analyze(@Param('id') profileId: string, @Request() req: any) {
    return this.analysisWorkflow.executeAnalysis(profileId, req.user.id);
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
        snapshot: true,
        analysisItems: { include: { competency: true } },
        roadmapSteps: { include: { competency: true }, orderBy: { orderIndex: 'asc' } },
      },
    });
    if (!analysis) throw new NotFoundException('No analysis results found');

    return this.analysisWorkflow.formatAnalysisResponse(analysis);
  }

  @Get(':id/results/history')
  async getResultsHistory(
    @Param('id') profileId: string,
    @Request() req: any,
    @Query('limit') limitRaw?: string,
  ) {
    const profile = await this.prisma.relocationProfile.findFirst({
      where: { id: profileId, userId: req.user.id },
    });
    if (!profile) throw new NotFoundException('Profile not found');

    const parsedLimit = Number(limitRaw ?? 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(50, Math.trunc(parsedLimit)))
      : 10;

    const analyses = await this.prisma.analysisResult.findMany({
      where: { profileId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        snapshot: true,
      },
    });

    return {
      items: analyses.map((analysis) => ({
        id: analysis.id,
        createdAt: analysis.createdAt,
        fitScore: Number(analysis.fitScore),
        totalPrepMonths: Number(analysis.totalPrepMonths),
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
      })),
      limit,
    };
  }

  @Get(':id/results/:analysisId')
  async getResultById(
    @Param('id') profileId: string,
    @Param('analysisId') analysisId: string,
    @Request() req: any,
  ) {
    const profile = await this.prisma.relocationProfile.findFirst({
      where: { id: profileId, userId: req.user.id },
    });
    if (!profile) throw new NotFoundException('Profile not found');

    const analysis = await this.prisma.analysisResult.findFirst({
      where: { id: analysisId, profileId },
      include: {
        snapshot: true,
        analysisItems: { include: { competency: true } },
        roadmapSteps: { include: { competency: true }, orderBy: { orderIndex: 'asc' } },
      },
    });
    if (!analysis) throw new NotFoundException('Analysis result not found');

    return this.analysisWorkflow.formatAnalysisResponse(analysis);
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
}
