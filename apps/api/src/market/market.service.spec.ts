import { MarketService } from './market.service';

describe('MarketService', () => {
  const skillFindFirst = jest.fn();
  const skillAliasFindFirst = jest.fn();
  const marketSnapshotCreate = jest.fn();
  const competencyFindMany = jest.fn();
  const jobPostingFindUnique = jest.fn();
  const jobPostingCreate = jest.fn();
  const jobPostingUpdate = jest.fn();
  const marketDigestRecomputeCountry = jest.fn();
  const marketDigestRecomputeMany = jest.fn();

  const prisma = {
    skill: {
      findFirst: skillFindFirst,
    },
    skillAlias: {
      findFirst: skillAliasFindFirst,
    },
    marketSnapshot: {
      create: marketSnapshotCreate,
    },
    competency: {
      findMany: competencyFindMany,
    },
    jobPosting: {
      findUnique: jobPostingFindUnique,
      create: jobPostingCreate,
      update: jobPostingUpdate,
    },
  };

  const marketDigestService = {
    recomputeCountryDigest: marketDigestRecomputeCountry,
    recomputeMany: marketDigestRecomputeMany,
  };

  let service: MarketService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MarketService(prisma as any, marketDigestService as any);
  });

  it('recomputes digest after manual import', async () => {
    skillFindFirst.mockResolvedValue({ id: 'skill-1', name: 'Docker' });
    marketSnapshotCreate.mockResolvedValue({
      id: 'snap-1',
      country: 'DE',
      source: 'manual',
      totalVacancies: 100,
      skillDemands: [],
    });
    marketDigestRecomputeCountry.mockResolvedValue(undefined);

    await service.importManual({
      country: 'DE',
      city: 'Berlin',
      totalVacancies: 100,
      skills: [{ skillName: 'Docker', frequency: 0.4, avgRequiredLevel: 0.7 }],
    });

    expect(marketDigestRecomputeCountry).toHaveBeenCalledWith('DE');
  });

  it('recomputes digests for affected countries after job postings import', async () => {
    competencyFindMany.mockResolvedValue([
      { id: 'comp-ts', name: 'TypeScript' },
    ]);
    jobPostingFindUnique.mockResolvedValue(null);
    jobPostingCreate.mockResolvedValue({});
    marketDigestRecomputeMany.mockResolvedValue(undefined);

    const result = await service.importJobPostings({
      items: [
        {
          countryCode: 'DE',
          roleName: 'Backend Developer',
          title: 'Backend Developer',
          company: 'Acme',
          location: 'Berlin',
          source: 'api',
          requirements: ['TypeScript'],
        },
        {
          countryCode: 'DE',
          roleName: 'DevOps Engineer',
          title: 'DevOps Engineer',
          company: 'Acme',
          location: 'Berlin',
          source: 'api',
          requirements: ['TypeScript'],
        },
        {
          countryCode: 'PL',
          roleName: 'Backend Developer',
          title: 'Backend Developer',
          company: 'Beta',
          location: 'Warsaw',
          source: 'api',
          requirements: ['TypeScript'],
        },
      ],
    });

    expect(result.inserted).toBe(3);
    expect(marketDigestRecomputeMany).toHaveBeenCalledTimes(1);
    expect(marketDigestRecomputeMany).toHaveBeenCalledWith(['DE', 'PL']);
  });
});
