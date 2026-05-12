import { LegalKnowledgeEngineService } from './legal-knowledge-engine.service.js';

function riskRank(level: 'LOW' | 'MODERATE' | 'HIGH' | 'UNKNOWN') {
  if (level === 'HIGH') return 3;
  if (level === 'MODERATE') return 2;
  if (level === 'LOW') return 1;
  return 0;
}

describe('LegalKnowledgeEngineService', () => {
  let service: LegalKnowledgeEngineService;

  beforeEach(() => {
    service = new LegalKnowledgeEngineService();
  });

  it('non-EU to EU triggers legal check and key questions', () => {
    const result = service.evaluate({
      sourceCountry: 'UA',
      targetCountry: 'DE',
    });

    expect(result.visaCheckLikelyRequired).toBe(true);
    expect(['HIGH', 'MODERATE']).toContain(result.overallRisk);
    expect(result.questions.some((q) => q.key === 'hasJobOffer')).toBe(true);
    expect(
      result.questions.some((q) => q.key === 'hasExistingWorkAuthorization'),
    ).toBe(true);
    expect(result.recommendedArticleSlugs).toContain(
      'non-eu-to-eu-relocation-checklist',
    );
  });

  it('EU to EU has lower risk and recommends EU internal basics', () => {
    const result = service.evaluate({
      sourceCountry: 'PL',
      targetCountry: 'DE',
    });

    expect(['LOW', 'MODERATE']).toContain(result.overallRisk);
    expect(
      result.warnings.some((warning) => warning.code === 'LEGAL_TIMELINE_RISK'),
    ).toBe(false);
    expect(result.recommendedArticleSlugs).toContain(
      'eu-internal-relocation-basics',
    );
  });

  it('existing work authorization reduces risk', () => {
    const withoutAuthorization = service.evaluate({
      sourceCountry: 'UA',
      targetCountry: 'DE',
      hasExistingWorkAuthorization: false,
    });
    const withAuthorization = service.evaluate({
      sourceCountry: 'UA',
      targetCountry: 'DE',
      hasExistingWorkAuthorization: true,
    });

    expect(riskRank(withAuthorization.overallRisk)).toBeLessThanOrEqual(
      riskRank(withoutAuthorization.overallRisk),
    );
    expect(
      withAuthorization.advice.some(
        (item) => item.code === 'VERIFY_AUTHORIZATION_VALIDITY',
      ),
    ).toBe(true);
  });

  it('Germany Blue Card route appears as possible route signal', () => {
    const result = service.evaluate({
      sourceCountry: 'UA',
      targetCountry: 'DE',
      hasJobOffer: true,
      hasRecognizedDegree: true,
      desiredRole: 'DevOps Engineer',
    });

    expect(
      result.possibleRoutes.some((route) => route.code === 'EU_BLUE_CARD_CANDIDATE'),
    ).toBe(true);
    expect(result.recommendedArticleSlugs).toContain('germany-blue-card-overview');
    expect(result.disclaimer.length).toBeGreaterThan(0);
  });

  it('no job offer warning appears for EU work-based route', () => {
    const result = service.evaluate({
      sourceCountry: 'UA',
      targetCountry: 'DE',
      hasJobOffer: false,
    });

    expect(
      result.warnings.some((warning) => warning.code === 'NO_JOB_OFFER_WARNING'),
    ).toBe(true);
  });

  it('unknown country pair falls back to UNKNOWN risk and official-source advice', () => {
    const result = service.evaluate({
      sourceCountry: 'XX',
      targetCountry: 'DE',
    });

    expect(result.overallRisk).toBe('UNKNOWN');
    expect(
      result.advice.some((item) => item.code === 'OFFICIAL_SOURCE_REQUIRED'),
    ).toBe(true);
    expect(result.disclaimer.length).toBeGreaterThan(0);
  });
});
