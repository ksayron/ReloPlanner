import { Injectable } from '@nestjs/common';
import {
  SkillMatchResult,
  GapItemInput,
  SkillMeta,
  SkillCategoryType,
} from './scoring.types.js';
import { randomUUID } from 'crypto';

const BASE_RATES: Record<string, number> = {
  HARD_SKILL: 3,
  LANGUAGE: 6,
  CERTIFICATION: 2,
  EXPERIENCE: 6,
};

function mapCategoryToGapType(
  category: SkillCategoryType,
): 'HARD_SKILL' | 'LANGUAGE' | 'CERTIFICATION' | 'EXPERIENCE' {
  switch (category) {
    case 'LANGUAGE':
      return 'LANGUAGE';
    case 'CERTIFICATION':
      return 'CERTIFICATION';
    case 'SOFT_SKILL':
    case 'HARD_SKILL':
    default:
      return 'HARD_SKILL';
  }
}

function classifySeverity(
  matchScore: number,
  frequency: number,
): 'CRITICAL' | 'MODERATE' | 'MINOR' {
  if (matchScore < 0.3 && frequency >= 0.3) return 'CRITICAL';
  if (matchScore < 0.7 && frequency >= 0.15) return 'MODERATE';
  return 'MINOR';
}

@Injectable()
export class GapAnalysisService {
  analyzeGaps(
    breakdown: SkillMatchResult[],
    skillMeta: Map<string, SkillMeta>,
  ): GapItemInput[] {
    const gaps: GapItemInput[] = [];

    for (const item of breakdown) {
      if (item.matchScore >= 0.7) continue;

      const meta = skillMeta.get(item.skillId);
      const category = meta?.category ?? 'HARD_SKILL';
      const gapType = mapCategoryToGapType(category);
      const severity = classifySeverity(item.matchScore, item.weight);
      const estimatedMonths =
        (item.requiredLevel - item.userLevel) * BASE_RATES[gapType];

      gaps.push({
        id: randomUUID(),
        skillId: item.skillId,
        gapType,
        severity,
        currentLevel: item.userLevel,
        requiredLevel: item.requiredLevel,
        estimatedMonths: Math.max(0, parseFloat(estimatedMonths.toFixed(1))),
        dependsOn: [],
        orderIndex: 0,
      });
    }

    return gaps;
  }
}
