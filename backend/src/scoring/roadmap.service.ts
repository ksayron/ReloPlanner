import { Injectable } from '@nestjs/common';
import { GapItemInput, RoadmapResult, SkillMeta } from './scoring.types.js';

@Injectable()
export class RoadmapService {
  buildRoadmap(
    gaps: GapItemInput[],
    parentMap: Map<string, string | null>,
  ): RoadmapResult {
    if (gaps.length === 0) {
      return { orderedGaps: [], totalPrepMonths: 0 };
    }

    // Build a set of skillIds that are gaps
    const gapSkillIds = new Set(gaps.map((g) => g.skillId));
    // Map skillId -> gapItem for lookup
    const skillToGap = new Map<string, GapItemInput>();
    for (const gap of gaps) {
      skillToGap.set(gap.skillId, gap);
    }

    // Resolve dependencies: if skill A is parent of skill B in taxonomy,
    // and both are gaps, then gap(B) depends on gap(A)
    for (const gap of gaps) {
      const parentSkillId = parentMap.get(gap.skillId) ?? null;
      if (parentSkillId && gapSkillIds.has(parentSkillId)) {
        const parentGap = skillToGap.get(parentSkillId)!;
        gap.dependsOn.push(parentGap.id);
      }
    }

    // Topological sort (Kahn's algorithm)
    const sorted = this.topologicalSort(gaps);

    // Compute critical path (forward pass)
    const arrivalTime = new Map<string, number>();
    for (const gap of sorted) {
      let maxDepTime = 0;
      for (const depId of gap.dependsOn) {
        const depGap = gaps.find((g) => g.id === depId);
        if (depGap) {
          const depArrival = arrivalTime.get(depId) ?? 0;
          maxDepTime = Math.max(maxDepTime, depArrival + depGap.estimatedMonths);
        }
      }
      arrivalTime.set(gap.id, maxDepTime);
    }

    // totalPrepMonths = max(arrivalTime + estimatedMonths) across all gaps
    let totalPrepMonths = 0;
    for (const gap of sorted) {
      const finish = (arrivalTime.get(gap.id) ?? 0) + gap.estimatedMonths;
      totalPrepMonths = Math.max(totalPrepMonths, finish);
    }

    return {
      orderedGaps: sorted,
      totalPrepMonths: parseFloat(totalPrepMonths.toFixed(1)),
    };
  }

  private topologicalSort(gaps: GapItemInput[]): GapItemInput[] {
    const gapById = new Map<string, GapItemInput>();
    for (const gap of gaps) {
      gapById.set(gap.id, gap);
    }

    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    for (const gap of gaps) {
      inDegree.set(gap.id, gap.dependsOn.length);
      for (const depId of gap.dependsOn) {
        const list = dependents.get(depId) || [];
        list.push(gap.id);
        dependents.set(depId, list);
      }
    }

    const queue = gaps.filter((g) => (inDegree.get(g.id) ?? 0) === 0);
    const result: GapItemInput[] = [];
    let idx = 0;

    while (queue.length > 0) {
      const cur = queue.shift()!;
      cur.orderIndex = idx++;
      result.push(cur);

      for (const depId of dependents.get(cur.id) || []) {
        const newDeg = (inDegree.get(depId) ?? 1) - 1;
        inDegree.set(depId, newDeg);
        if (newDeg === 0) {
          const depGap = gapById.get(depId);
          if (depGap) queue.push(depGap);
        }
      }
    }

    if (result.length < gaps.length) {
      throw new Error('Cyclic dependency detected in gap items');
    }

    return result;
  }
}
