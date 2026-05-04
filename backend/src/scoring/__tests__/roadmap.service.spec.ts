import { RoadmapService } from '../roadmap.service';
import { GapItemInput } from '../scoring.types';

describe('RoadmapService', () => {
  let service: RoadmapService;

  beforeEach(() => {
    service = new RoadmapService();
  });

  it('should order Docker before Kubernetes (parent dependency)', () => {
    const gaps: GapItemInput[] = [
      {
        id: 'gap-k8s',
        skillId: 'k8s',
        gapType: 'HARD_SKILL',
        severity: 'MODERATE',
        currentLevel: 0,
        requiredLevel: 0.55,
        estimatedMonths: 1.7,
        dependsOn: [],
        orderIndex: 0,
      },
      {
        id: 'gap-docker',
        skillId: 'docker',
        gapType: 'HARD_SKILL',
        severity: 'MODERATE',
        currentLevel: 0.1,
        requiredLevel: 0.6,
        estimatedMonths: 1.5,
        dependsOn: [],
        orderIndex: 0,
      },
    ];

    // k8s's parent is docker in taxonomy
    const parentMap = new Map<string, string | null>([
      ['docker', null],
      ['k8s', 'docker'],
    ]);

    const result = service.buildRoadmap(gaps, parentMap);

    const dockerGap = result.orderedGaps.find((g) => g.skillId === 'docker')!;
    const k8sGap = result.orderedGaps.find((g) => g.skillId === 'k8s')!;
    expect(dockerGap.orderIndex).toBeLessThan(k8sGap.orderIndex);
    expect(k8sGap.dependsOn).toContain('gap-docker');
  });

  it('should calculate totalPrepMonths as max path (parallel gaps)', () => {
    const gaps: GapItemInput[] = [
      {
        id: 'gap-a',
        skillId: 'skill-a',
        gapType: 'HARD_SKILL',
        severity: 'MODERATE',
        currentLevel: 0,
        requiredLevel: 0.7,
        estimatedMonths: 3.0,
        dependsOn: [],
        orderIndex: 0,
      },
      {
        id: 'gap-b',
        skillId: 'skill-b',
        gapType: 'LANGUAGE',
        severity: 'CRITICAL',
        currentLevel: 0,
        requiredLevel: 0.8,
        estimatedMonths: 5.0,
        dependsOn: [],
        orderIndex: 0,
      },
    ];

    // No parent-child relationship, independent gaps
    const parentMap = new Map<string, string | null>([
      ['skill-a', null],
      ['skill-b', null],
    ]);

    const result = service.buildRoadmap(gaps, parentMap);

    // Parallel: totalPrep = max(3, 5) = 5, not sum(3+5) = 8
    expect(result.totalPrepMonths).toBe(5.0);
  });

  it('should calculate totalPrepMonths as sum for sequential deps', () => {
    const gaps: GapItemInput[] = [
      {
        id: 'gap-parent',
        skillId: 'parent-skill',
        gapType: 'HARD_SKILL',
        severity: 'MODERATE',
        currentLevel: 0,
        requiredLevel: 0.5,
        estimatedMonths: 2.0,
        dependsOn: [],
        orderIndex: 0,
      },
      {
        id: 'gap-child',
        skillId: 'child-skill',
        gapType: 'HARD_SKILL',
        severity: 'MODERATE',
        currentLevel: 0,
        requiredLevel: 0.7,
        estimatedMonths: 3.0,
        dependsOn: [],
        orderIndex: 0,
      },
    ];

    const parentMap = new Map<string, string | null>([
      ['parent-skill', null],
      ['child-skill', 'parent-skill'],
    ]);

    const result = service.buildRoadmap(gaps, parentMap);

    // Sequential: totalPrep = 2 + 3 = 5
    expect(result.totalPrepMonths).toBe(5.0);
  });

  it('should handle empty gaps list', () => {
    const result = service.buildRoadmap([], new Map());
    expect(result.orderedGaps).toHaveLength(0);
    expect(result.totalPrepMonths).toBe(0);
  });
});
