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
import { AnalysisWorkflowService } from './analysis-workflow.service.js';

@Controller('profiles')
@UseGuards(AuthGuard('jwt'))
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
        analysisItems: { include: { competency: true } },
        roadmapSteps: { include: { competency: true }, orderBy: { orderIndex: 'asc' } },
      },
    });
    if (!analysis) throw new NotFoundException('No analysis results found');

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
