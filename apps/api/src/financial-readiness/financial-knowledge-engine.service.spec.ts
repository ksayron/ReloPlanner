import { ConfigService } from '@nestjs/config';
import { FinancialKnowledgeEngineService } from './financial-knowledge-engine.service.js';

function makePrismaMock() {
  return {
    costOfLivingData: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
  };
}

describe('FinancialKnowledgeEngineService', () => {
  let service: FinancialKnowledgeEngineService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'FINANCIAL_DEPENDENT_COST_FACTOR') return 0.25;
        if (key === 'FINANCIAL_MIN_RUNWAY_MONTHS') return 6;
        return undefined;
      }),
    } as unknown as ConfigService;
    service = new FinancialKnowledgeEngineService(prisma as any, config);
  });

  it('uses city data when available', async () => {
    prisma.costOfLivingData.findMany.mockResolvedValueOnce([
      { category: 'RENT', avgMonthlyUsd: 1200 },
      { category: 'FOOD', avgMonthlyUsd: 400 },
      { category: 'TRANSPORT', avgMonthlyUsd: 150 },
      { category: 'UTILITIES', avgMonthlyUsd: 200 },
      { category: 'OTHER', avgMonthlyUsd: 250 },
    ]);

    const result = await service.evaluate({
      targetCountry: 'DE',
      targetCity: 'Berlin',
      savingsAmount: 12000,
      savingsCurrency: 'USD',
      monthlyBudgetAmount: 1800,
      monthlyBudgetCurrency: 'USD',
      dependentsCount: 0,
      lifestyle: 'STANDARD',
      jobSearchMonths: 6,
    });

    expect(result.costEstimate.source).toBe('CITY');
    expect(result.costEstimate.totalMonthlyEstimateUsd).toBeGreaterThan(0);
    expect(result.runwayMonths).not.toBeNull();
  });

  it('falls back to country averages when city data is missing', async () => {
    prisma.costOfLivingData.findMany.mockResolvedValueOnce([]);
    prisma.costOfLivingData.groupBy.mockResolvedValueOnce([
      { category: 'RENT', _avg: { avgMonthlyUsd: 900 } },
      { category: 'FOOD', _avg: { avgMonthlyUsd: 320 } },
      { category: 'TRANSPORT', _avg: { avgMonthlyUsd: 120 } },
      { category: 'UTILITIES', _avg: { avgMonthlyUsd: 180 } },
      { category: 'OTHER', _avg: { avgMonthlyUsd: 220 } },
    ]);

    const result = await service.evaluate({
      targetCountry: 'DE',
      targetCity: 'Unknown City',
      savingsAmount: 3000,
      savingsCurrency: 'USD',
      dependentsCount: 0,
      lifestyle: 'STANDARD',
      jobSearchMonths: 6,
    });

    expect(result.costEstimate.source).toBe('COUNTRY');
  });

  it('falls back to global averages when country data is missing', async () => {
    prisma.costOfLivingData.findMany.mockResolvedValueOnce([]);
    prisma.costOfLivingData.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { category: 'RENT', _avg: { avgMonthlyUsd: 800 } },
        { category: 'FOOD', _avg: { avgMonthlyUsd: 300 } },
      ]);

    const result = await service.evaluate({
      targetCountry: 'XX',
      targetCity: 'Nowhere',
      savingsAmount: 1000,
      savingsCurrency: 'USD',
      lifestyle: 'STANDARD',
      dependentsCount: 0,
      jobSearchMonths: 6,
    });

    expect(result.costEstimate.source).toBe('GLOBAL');
  });

  it('reduces risk when expected salary covers monthly need', async () => {
    prisma.costOfLivingData.findMany.mockResolvedValueOnce([
      { category: 'RENT', avgMonthlyUsd: 1000 },
      { category: 'FOOD', avgMonthlyUsd: 350 },
      { category: 'TRANSPORT', avgMonthlyUsd: 120 },
      { category: 'UTILITIES', avgMonthlyUsd: 150 },
      { category: 'OTHER', avgMonthlyUsd: 200 },
    ]);

    const result = await service.evaluate({
      targetCountry: 'DE',
      targetCity: 'Berlin',
      savingsAmount: 10000,
      savingsCurrency: 'USD',
      expectedNetSalaryAmount: 4000,
      expectedNetSalaryCurrency: 'USD',
      lifestyle: 'STANDARD',
      dependentsCount: 0,
      jobSearchMonths: 6,
    });

    expect(['LOW', 'MODERATE']).toContain(result.financialRiskLevel);
    expect(
      result.advice.some(
        (item) => item.code === 'VERIFY_SALARY_NET_ASSUMPTIONS',
      ),
    ).toBe(true);
  });

  it('increases risk for dependents and short runway', async () => {
    prisma.costOfLivingData.findMany.mockResolvedValueOnce([
      { category: 'RENT', avgMonthlyUsd: 1200 },
      { category: 'FOOD', avgMonthlyUsd: 450 },
      { category: 'TRANSPORT', avgMonthlyUsd: 150 },
      { category: 'UTILITIES', avgMonthlyUsd: 220 },
      { category: 'OTHER', avgMonthlyUsd: 280 },
    ]);

    const result = await service.evaluate({
      targetCountry: 'DE',
      targetCity: 'Berlin',
      savingsAmount: 1500,
      savingsCurrency: 'USD',
      dependentsCount: 2,
      lifestyle: 'STANDARD',
      jobSearchMonths: 6,
    });

    expect(result.financialRiskLevel).toBe('HIGH');
    expect(
      result.warnings.some((item) => item.code === 'DEPENDENTS_COST_PRESSURE'),
    ).toBe(true);
  });
});
