import { GapAnalysisService } from '../gap-analysis.service';
import { SkillMatchResult, SkillMeta } from '../scoring.types';

describe('GapAnalysisService', () => {
  let service: GapAnalysisService;

  beforeEach(() => {
    service = new GapAnalysisService();
  });

  it('should return no gaps when all skills match >= 0.7', () => {
    const breakdown: SkillMatchResult[] = [
      { skillId: 'js', matchScore: 0.9, weight: 0.6, userLevel: 0.8, requiredLevel: 0.7, source: 'direct' },
      { skillId: 'py', matchScore: 0.7, weight: 0.4, userLevel: 0.7, requiredLevel: 0.7, source: 'direct' },
    ];
    const meta = new Map<string, SkillMeta>([
      ['js', { category: 'HARD_SKILL', parentId: null }],
      ['py', { category: 'HARD_SKILL', parentId: null }],
    ]);

    const gaps = service.analyzeGaps(breakdown, meta);
    expect(gaps).toHaveLength(0);
  });

  it('should classify CRITICAL severity (matchScore < 0.3 AND frequency >= 0.3)', () => {
    const breakdown: SkillMatchResult[] = [
      { skillId: 'docker', matchScore: 0.1, weight: 0.5, userLevel: 0.05, requiredLevel: 0.6, source: 'direct' },
    ];
    const meta = new Map<string, SkillMeta>([
      ['docker', { category: 'HARD_SKILL', parentId: null }],
    ]);

    const gaps = service.analyzeGaps(breakdown, meta);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].severity).toBe('CRITICAL');
  });

  it('should classify MODERATE severity (matchScore < 0.7 AND frequency >= 0.15)', () => {
    const breakdown: SkillMatchResult[] = [
      { skillId: 'react', matchScore: 0.5, weight: 0.2, userLevel: 0.35, requiredLevel: 0.7, source: 'direct' },
    ];
    const meta = new Map<string, SkillMeta>([
      ['react', { category: 'HARD_SKILL', parentId: null }],
    ]);

    const gaps = service.analyzeGaps(breakdown, meta);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].severity).toBe('MODERATE');
  });

  it('should classify MINOR severity for low frequency gaps', () => {
    const breakdown: SkillMatchResult[] = [
      { skillId: 'graphql', matchScore: 0.4, weight: 0.1, userLevel: 0.2, requiredLevel: 0.5, source: 'direct' },
    ];
    const meta = new Map<string, SkillMeta>([
      ['graphql', { category: 'HARD_SKILL', parentId: null }],
    ]);

    const gaps = service.analyzeGaps(breakdown, meta);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].severity).toBe('MINOR');
  });

  it('should use correct base rates for time estimation', () => {
    const breakdown: SkillMatchResult[] = [
      { skillId: 'english', matchScore: 0.5, weight: 0.8, userLevel: 0.4, requiredLevel: 0.8, source: 'direct' },
    ];
    const meta = new Map<string, SkillMeta>([
      ['english', { category: 'LANGUAGE', parentId: null }],
    ]);

    const gaps = service.analyzeGaps(breakdown, meta);
    // (0.8 - 0.4) * 6 = 2.4
    expect(gaps[0].estimatedMonths).toBeCloseTo(2.4, 1);
    expect(gaps[0].gapType).toBe('LANGUAGE');
  });
});
