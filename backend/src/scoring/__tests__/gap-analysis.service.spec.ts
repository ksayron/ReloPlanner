import { GapAnalysisService } from '../gap-analysis.service';

describe('GapAnalysisService', () => {
  it('returns only roadmap-included items as actionable', () => {
    const service = new GapAnalysisService();
    const items: any[] = [
      { includedInRoadmap: true, competency: { name: 'Docker' } },
      { includedInRoadmap: false, competency: { name: 'React' } },
    ];

    const actionable = service.extractActionable(items as any);
    expect(actionable).toHaveLength(1);
    expect(actionable[0].competency.name).toBe('Docker');
  });
});
