import { Injectable } from '@nestjs/common';
import { AnalysisItemResult } from './scoring.types.js';

@Injectable()
export class GapAnalysisService {
  extractActionable(items: AnalysisItemResult[]): AnalysisItemResult[] {
    return items.filter((x) => x.includedInRoadmap);
  }
}
