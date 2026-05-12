import { Module } from '@nestjs/common';
import { ScoringService } from './scoring.service.js';
import { GapAnalysisService } from './gap-analysis.service.js';
import { RoadmapService } from './roadmap.service.js';
import { ScoringController } from './scoring.controller.js';
import { AnalysisWorkflowService } from './analysis-workflow.service.js';
import { ScoringAdminController } from './scoring-admin.controller.js';
import { ScoringTuningService } from './scoring-tuning.service.js';
import { JobMatchingService } from './job-matching.service.js';
import { BillingModule } from '../billing/billing.module.js';

@Module({
  imports: [BillingModule],
  controllers: [ScoringController, ScoringAdminController],
  providers: [
    ScoringService,
    ScoringTuningService,
    GapAnalysisService,
    RoadmapService,
    AnalysisWorkflowService,
    JobMatchingService,
  ],
  exports: [
    ScoringService,
    ScoringTuningService,
    GapAnalysisService,
    RoadmapService,
    AnalysisWorkflowService,
    JobMatchingService,
  ],
})
export class ScoringModule {}
