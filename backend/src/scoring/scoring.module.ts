import { Module } from '@nestjs/common';
import { ScoringService } from './scoring.service.js';
import { GapAnalysisService } from './gap-analysis.service.js';
import { RoadmapService } from './roadmap.service.js';
import { ScoringController } from './scoring.controller.js';

@Module({
  controllers: [ScoringController],
  providers: [ScoringService, GapAnalysisService, RoadmapService],
  exports: [ScoringService, GapAnalysisService, RoadmapService],
})
export class ScoringModule {}
