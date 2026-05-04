import { ScoringService } from '../scoring.service';
import { TransferEdge, SkillDemand } from '../scoring.types';

describe('ScoringService', () => {
  let service: ScoringService;

  beforeEach(() => {
    service = new ScoringService();
  });

  describe('expandSkillVector', () => {
    it('should expand skills via transferability edges', () => {
      const userVec = new Map<string, number>([['csharp', 0.8]]);
      const transferMatrix = new Map<string, TransferEdge[]>([
        ['csharp', [{ targetId: 'java', coefficient: 0.7 }]],
      ]);

      const expanded = service.expandSkillVector(userVec, transferMatrix);

      expect(expanded.get('csharp')).toBe(0.8);
      expect(expanded.get('java')).toBeCloseTo(0.56, 2);
    });

    it('should keep the higher value when user has direct and transferred skill', () => {
      const userVec = new Map<string, number>([
        ['csharp', 0.8],
        ['java', 0.9],
      ]);
      const transferMatrix = new Map<string, TransferEdge[]>([
        ['csharp', [{ targetId: 'java', coefficient: 0.7 }]],
      ]);

      const expanded = service.expandSkillVector(userVec, transferMatrix);

      // Direct java (0.9) > transferred (0.8 * 0.7 = 0.56)
      expect(expanded.get('java')).toBe(0.9);
    });
  });

  describe('computeFitScore', () => {
    it('should return 1.0 for perfect match', () => {
      const expanded = new Map<string, number>([
        ['js', 0.8],
        ['python', 0.7],
      ]);
      const demandVec = new Map<string, SkillDemand>([
        ['js', { frequency: 0.6, requiredLevel: 0.7 }],
        ['python', { frequency: 0.4, requiredLevel: 0.7 }],
      ]);
      const originalSkills = new Set(['js', 'python']);

      const result = service.computeFitScore(expanded, demandVec, originalSkills);

      expect(result.score).toBe(1.0);
      expect(result.breakdown).toHaveLength(2);
    });

    it('should return ~0 for empty profile', () => {
      const expanded = new Map<string, number>();
      const demandVec = new Map<string, SkillDemand>([
        ['js', { frequency: 0.6, requiredLevel: 0.7 }],
        ['python', { frequency: 0.4, requiredLevel: 0.7 }],
      ]);
      const originalSkills = new Set<string>();

      const result = service.computeFitScore(expanded, demandVec, originalSkills);

      expect(result.score).toBeCloseTo(0, 1);
    });

    it('should detect transferability source correctly', () => {
      const expanded = new Map<string, number>([
        ['csharp', 0.8],
        ['java', 0.56],
      ]);
      const demandVec = new Map<string, SkillDemand>([
        ['java', { frequency: 0.5, requiredLevel: 1.0 }],
      ]);
      // csharp is original, java is derived via transfer
      const originalSkills = new Set(['csharp']);

      const result = service.computeFitScore(expanded, demandVec, originalSkills);

      expect(result.breakdown[0].source).toBe('transferability');
      expect(result.breakdown[0].matchScore).toBeCloseTo(0.56, 2);
    });

    it('should filter noise (frequency < 0.05)', () => {
      const expanded = new Map<string, number>([['js', 0.8]]);
      const demandVec = new Map<string, SkillDemand>([
        ['js', { frequency: 0.6, requiredLevel: 0.7 }],
        ['obscure', { frequency: 0.03, requiredLevel: 0.9 }],
      ]);
      const originalSkills = new Set(['js']);

      const result = service.computeFitScore(expanded, demandVec, originalSkills);

      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].skillId).toBe('js');
    });
  });
});
