import { Module } from '@nestjs/common';
import { ScoringService } from './scoring.service.js';
import { GapAnalysisService } from './gap-analysis.service.js';
import { RoadmapService } from './roadmap.service.js';
import { ScoringController } from './scoring.controller.js';
import { AnalysisWorkflowService } from './analysis-workflow.service.js';

@Module({
  controllers: [ScoringController],
  providers: [
    ScoringService,
    GapAnalysisService,
    RoadmapService,
    AnalysisWorkflowService,
  ],
  exports: [ScoringService, GapAnalysisService, RoadmapService, AnalysisWorkflowService],
})
export class ScoringModule {}
