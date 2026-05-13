import { Injectable } from '@nestjs/common';
import { RoadmapStepResult } from './scoring.types.js';

@Injectable()
export class RoadmapService {
  sortRoadmap(steps: RoadmapStepResult[]): RoadmapStepResult[] {
    return [...steps].sort((a, b) => a.orderIndex - b.orderIndex);
  }
}
