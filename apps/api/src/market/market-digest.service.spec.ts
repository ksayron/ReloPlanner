import { BadRequestException } from '@nestjs/common';
import { MarketDigestService } from './market-digest.service';

describe('MarketDigestService', () => {
  const marketSnapshotFindFirst = jest.fn();
  const marketDigestUpsert = jest.fn();
  const marketDigestFindUnique = jest.fn();
  const jobPostingGroupBy = jest.fn();
  const jobPostingFindMany = jest.fn();

  const prisma = {
    marketSnapshot: {
      findFirst: marketSnapshotFindFirst,
    },
    marketDigest: {
      upsert: marketDigestUpsert,
      findUnique: marketDigestFindUnique,
    },
    jobPosting: {
      groupBy: jobPostingGroupBy,
      findMany: jobPostingFindMany,
    },
  };

  let service: MarketDigestService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MarketDigestService(prisma as any);
  });

  it('recomputes digest with all roles sorted and top 10 skills capped', async () => {
    marketSnapshotFindFirst.mockResolvedValue({
      id: 's1',
      country: 'DE',
      source: 'api',
      snapshotDate: new Date('2026-05-15T00:00:00Z'),
      totalVacancies: 200,
      skillDemands: Array.from({ length: 12 }).map((_, index) => ({
        frequency: (12 - index) / 100,
        skill: { name: `Skill ${index + 1}` },
      })),
    });
    jobPostingGroupBy.mockResolvedValue([
      { roleName: 'DevOps Engineer', _count: { _all: 6 } },
      { roleName: 'Backend Developer', _count: { _all: 14 } },
      { roleName: 'QA Engineer', _count: { _all: 9 } },
    ]);
    jobPostingFindMany.mockResolvedValue([
      { requirements: ['AWS', 'TypeScript'] },
      { requirements: ['AWS', 'Docker'] },
      { requirements: ['TypeScript'] },
    ]);
    marketDigestUpsert.mockImplementation(async (args: any) => ({
      countryCode: args.create.countryCode,
      snapshotDate: args.create.snapshotDate,
      snapshotSource: args.create.snapshotSource,
      totalVacancies: args.create.totalVacancies,
      postingsSampleSize: args.create.postingsSampleSize,
      roles: args.create.roles,
      topSkills: args.create.topSkills,
      computedAt: new Date('2026-05-15T10:00:00Z'),
    }));

    const result = await service.recomputeCountryDigest('de');

    expect(result.countryCode).toBe('DE');
    expect(result.roles.map((row) => row.roleName)).toEqual([
      'Backend Developer',
      'QA Engineer',
      'DevOps Engineer',
    ]);
    expect(result.postingsSampleSize).toBe(29);
    expect(result.topSkills).toHaveLength(3);
    expect(result.topSkills[0].skillName).toBe('AWS');
    expect(result.hasData).toBe(true);
  });

  it('returns empty digest for supported country without persisted row', async () => {
    marketDigestFindUnique.mockResolvedValue(null);

    const result = await service.getCountryDigest('DE');

    expect(result).toEqual({
      countryCode: 'DE',
      hasData: false,
      snapshotDate: null,
      snapshotSource: null,
      totalVacancies: null,
      postingsSampleSize: 0,
      roles: [],
      topSkills: [],
      computedAt: null,
    });
    expect(jobPostingGroupBy).not.toHaveBeenCalled();
    expect(marketDigestUpsert).not.toHaveBeenCalled();
  });

  it('returns persisted digest without recalculating on read', async () => {
    marketDigestFindUnique.mockResolvedValue({
      countryCode: 'PL',
      snapshotDate: new Date('2026-05-14T00:00:00Z'),
      snapshotSource: 'api',
      totalVacancies: 300,
      postingsSampleSize: 10,
      roles: [{ roleName: 'Backend Developer', vacancies: 15 }],
      topSkills: [{ skillName: 'TypeScript', frequency: 0.3, count: 90 }],
      computedAt: new Date('2026-05-15T10:30:00Z'),
    });

    const result = await service.getCountryDigest('PL');

    expect(result.hasData).toBe(true);
    expect(result.roles).toHaveLength(1);
    expect(result.topSkills).toHaveLength(1);
    expect(jobPostingGroupBy).not.toHaveBeenCalled();
    expect(marketSnapshotFindFirst).not.toHaveBeenCalled();
    expect(marketDigestUpsert).not.toHaveBeenCalled();
  });

  it('rejects unsupported countries on public read', async () => {
    await expect(service.getCountryDigest('US')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
