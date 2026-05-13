import { AiReportEnrichmentService } from '../ai-report-enrichment.service';
import { AiProvider } from '../ai.provider.interface';
import { AiRoutingService } from '../ai-routing.service';
import { RelocationReadinessReportSnapshot } from '../../reports/reports.types';

const snapshotFixture: RelocationReadinessReportSnapshot = {
  reportType: 'RELOCATION_READINESS_REPORT',
  analysisId: 'analysis-1',
  generatedAt: new Date('2026-01-01T00:00:00.000Z'),
  profileSummary: {
    profileId: 'profile-1',
    targetCountry: 'DE',
    targetCity: 'Berlin',
    currentCountry: 'UA',
    yearsExperience: 4,
    desiredRole: 'Backend Developer',
  },
  readiness: {
    fitScore: 0.62,
    readinessLevel: 'NEAR_READY',
    totalPrepMonths: 6,
    timeEstimate: {
      optimisticHours: 120,
      realisticHours: 180,
      criticalPathHours: 160,
    },
  },
  skillBreakdown: [
    {
      competencyId: 'c1',
      competencyName: 'TypeScript',
      matchScore: 0.8,
      weight: 0.2,
      recommendationType: 'ACTIONABLE_GAP',
      reason: 'Sample reason',
    },
  ],
  detectedGaps: [
    {
      competencyId: 'c2',
      competencyName: 'System Design',
      currentLevel: 'BASIC',
      requiredLevel: 'ADVANCED',
      matchScore: 0.3,
      priority: 'CORE',
      roleRelevance: 'CORE',
      severity: 'CRITICAL',
      reason: 'Sample gap',
    },
  ],
  roadmap: [
    {
      orderIndex: 0,
      competencyId: 'c2',
      competencyName: 'System Design',
      currentDisplayLevel: 'BASIC',
      requiredDisplayLevel: 'ADVANCED',
      estimatedHours: 60,
      dependsOn: [],
      status: 'PENDING',
      reason: 'Sample roadmap',
    },
  ],
  marketContext: {
    country: 'DE',
    city: 'Berlin',
    snapshotDate: '2026-01-01',
    source: 'adzuna',
    totalVacancies: 1234,
    jobMarketNote: 'Sample note',
  },
};

const makeProvider = (
  name: 'OPENAI' | 'OPENROUTER' | 'MOCK',
  options: {
    available?: boolean;
    fail?: boolean;
    model?: string;
  } = {},
): AiProvider => ({
  name,
  isAvailable: () => options.available ?? true,
  summarizeReport: async () => {
    if (options.fail) {
      throw new Error(`${name} failure`);
    }
    return {
      model: options.model ?? `${name.toLowerCase()}-model`,
      summary: {
        executiveSummary: `${name} executive summary`,
        topStrengths: ['strength 1', 'strength 2', 'strength 3'],
        topRisks: ['risk 1', 'risk 2', 'risk 3'],
        recommendedStrategy: `${name} strategy`,
        advisoryDisclaimer: `${name} disclaimer`,
      },
    };
  },
});

describe('AiReportEnrichmentService', () => {
  const makeRouting = () =>
    new AiRoutingService({
      get: (key: string) => {
        if (key === 'AI_DEFAULT_PROVIDER_EASY') return 'OPENROUTER';
        if (key === 'AI_DEFAULT_PROVIDER_REASONING') return 'OPENAI';
        return undefined;
      },
    } as any);

  it('uses fallback provider when primary fails', async () => {
    const routing = makeRouting();
    const service = new AiReportEnrichmentService(
      routing,
      makeProvider('OPENAI', { fail: true }) as any,
      makeProvider('OPENROUTER') as any,
      makeProvider('MOCK') as any,
    );

    const response = await service.summarizeSnapshot(
      snapshotFixture,
      'REASONING',
    );
    expect(response.meta.providerUsed).toBe('OPENROUTER');
    expect(response.meta.fallbackUsed).toBe(true);
    expect(response.meta.attemptedProviders).toEqual(['OPENAI', 'OPENROUTER']);
    expect(response.meta.failureReasons.OPENAI).toContain('failure');
  });

  it('falls back to mock when external providers are unavailable', async () => {
    const routing = makeRouting();
    const service = new AiReportEnrichmentService(
      routing,
      makeProvider('OPENAI', { available: false }) as any,
      makeProvider('OPENROUTER', { available: false }) as any,
      makeProvider('MOCK') as any,
    );

    const response = await service.summarizeSnapshot(
      snapshotFixture,
      'REASONING',
    );
    expect(response.meta.providerUsed).toBe('MOCK');
    expect(response.meta.fallbackUsed).toBe(true);
    expect(response.summary.executiveSummary).toContain('MOCK');
  });

  it('does not mutate deterministic snapshot values', async () => {
    const routing = makeRouting();
    const service = new AiReportEnrichmentService(
      routing,
      makeProvider('OPENAI') as any,
      makeProvider('OPENROUTER') as any,
      makeProvider('MOCK') as any,
    );
    const originalFitScore = snapshotFixture.readiness.fitScore;
    const originalPrepMonths = snapshotFixture.readiness.totalPrepMonths;

    await service.summarizeSnapshot(snapshotFixture, 'REASONING');

    expect(snapshotFixture.readiness.fitScore).toBe(originalFitScore);
    expect(snapshotFixture.readiness.totalPrepMonths).toBe(originalPrepMonths);
  });
});
