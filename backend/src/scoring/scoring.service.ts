import { Injectable } from '@nestjs/common';
import {
  TransferEdge,
  SkillDemand,
  SkillMatchResult,
  FitScoreResult,
} from './scoring.types.js';

@Injectable()
export class ScoringService {
  expandSkillVector(
    userVec: Map<string, number>,
    transferMatrix: Map<string, TransferEdge[]>,
  ): Map<string, number> {
    const expanded = new Map(userVec);
    for (const [sourceId, proficiency] of userVec) {
      const edges = transferMatrix.get(sourceId) || [];
      for (const edge of edges) {
        const derived = proficiency * edge.coefficient;
        const current = expanded.get(edge.targetId) ?? 0;
        if (derived > current) {
          expanded.set(edge.targetId, derived);
        }
      }
    }
    return expanded;
  }

  computeFitScore(
    expanded: Map<string, number>,
    demandVec: Map<string, SkillDemand>,
    originalUserSkills: Set<string>,
  ): FitScoreResult {
    let totalWeighted = 0;
    let totalWeight = 0;
    const breakdown: SkillMatchResult[] = [];

    for (const [skillId, demand] of demandVec) {
      if (demand.frequency < 0.05) continue;
      const userLevel = expanded.get(skillId) ?? 0;
      const match = demand.requiredLevel > 0
        ? Math.min(userLevel / demand.requiredLevel, 1.0)
        : 1.0;
      const w = demand.frequency;
      totalWeighted += match * w;
      totalWeight += w;
      breakdown.push({
        skillId,
        matchScore: match,
        weight: w,
        userLevel,
        requiredLevel: demand.requiredLevel,
        source: userLevel > 0 && !originalUserSkills.has(skillId) ? 'transferability' : 'direct',
      });
    }

    return {
      score: totalWeight > 0 ? totalWeighted / totalWeight : 0,
      breakdown: breakdown.sort((a, b) => b.weight - a.weight),
    };
  }
}
