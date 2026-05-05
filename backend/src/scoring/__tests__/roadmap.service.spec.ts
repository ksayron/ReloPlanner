import { RoadmapService } from '../roadmap.service';

describe('RoadmapService', () => {
  it('keeps stable order by orderIndex', () => {
    const service = new RoadmapService();
    const sorted = service.sortRoadmap([
      { orderIndex: 2, id: '3' } as any,
      { orderIndex: 0, id: '1' } as any,
      { orderIndex: 1, id: '2' } as any,
    ]);

    expect(sorted.map((x) => x.id)).toEqual(['1', '2', '3']);
  });
});
