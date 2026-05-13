import { ScoringService } from '../scoring.service';
import {
  CompetencyRequirement,
  TransferEdge,
  UserCompetencyState,
} from '../scoring.types';

describe('ScoringService v2', () => {
  let service: ScoringService;

  beforeEach(() => {
    service = new ScoringService();
  });

  const baseReq = (
    overrides: Partial<CompetencyRequirement>,
  ): CompetencyRequirement => ({
    id: 'r1',
    competencyId: 'c1',
    competencyName: 'Docker',
    competencyType: 'HARD_SKILL',
    competencyFamily: 'containers',
    priority: 'CORE',
    roleRelevance: 'CORE',
    frequency: 0.5,
    importance: 1,
    hardSkillRequiredLevel: 'PRACTICAL',
    languageRequiredLevel: null,
    certificationRequirementLevel: null,
    requiredCertificationStatus: null,
    languageContext: null,
    ...overrides,
  });

  it('applies transferability only for hard-skill computation and produces actionable gap', () => {
    const requirements: CompetencyRequirement[] = [
      baseReq({ competencyId: 'k8s', competencyName: 'Kubernetes' }),
    ];

    const user: UserCompetencyState[] = [
      {
        competencyId: 'docker',
        competencyType: 'HARD_SKILL',
        hardSkillLevel: 'CONFIDENT',
      },
    ];

    const edges: TransferEdge[] = [
      {
        sourceCompetencyId: 'docker',
        targetCompetencyId: 'k8s',
        coefficient: 0.35,
      },
    ];

    const result = service.computeAnalysis({
      requirements,
      userCompetencies: user,
      transferEdges: edges,
      countryLanguageRelevance: new Map(),
      effortProfiles: new Map(),
      weeklyHours: 8,
    });

    expect(result.analysisItems).toHaveLength(1);
    expect(result.analysisItems[0].matchScore).toBeGreaterThan(0);
    expect(result.analysisItems[0].recommendationType).toBe('ACTIONABLE_GAP');
  });

  it('excludes irrelevant language by country filter', () => {
    const requirements: CompetencyRequirement[] = [
      baseReq({
        competencyId: 'fr',
        competencyName: 'French',
        competencyType: 'LANGUAGE',
        priority: 'IMPORTANT',
        roleRelevance: 'RELATED',
        hardSkillRequiredLevel: null,
        languageRequiredLevel: 'A2',
      }),
    ];

    const result = service.computeAnalysis({
      requirements,
      userCompetencies: [],
      transferEdges: [],
      countryLanguageRelevance: new Map([['fr', 'IRRELEVANT']]),
      effortProfiles: new Map(),
      weeklyHours: 8,
    });

    expect(result.analysisItems[0].recommendationType).toBe(
      'EXCLUDED_AS_IRRELEVANT',
    );
    expect(result.actionableGaps).toHaveLength(0);
  });

  it('optional/contextual non-roadmap items are not actionable', () => {
    const requirements: CompetencyRequirement[] = [
      baseReq({
        competencyId: 'react',
        competencyName: 'React',
        priority: 'OPTIONAL',
        roleRelevance: 'WEAKLY_RELATED',
      }),
    ];

    const result = service.computeAnalysis({
      requirements,
      userCompetencies: [],
      transferEdges: [],
      countryLanguageRelevance: new Map(),
      effortProfiles: new Map(),
      weeklyHours: 8,
    });

    expect(result.analysisItems[0].includedInRoadmap).toBe(false);
    expect(result.analysisItems[0].recommendationType).toBe(
      'OPTIONAL_IMPROVEMENT',
    );
  });

  it('fully matched core role skill is not labeled as market context', () => {
    const requirements: CompetencyRequirement[] = [
      baseReq({
        competencyId: 'nodejs',
        competencyName: 'Node.js',
        priority: 'CORE',
        roleRelevance: 'CORE',
      }),
    ];

    const user: UserCompetencyState[] = [
      {
        competencyId: 'nodejs',
        competencyType: 'HARD_SKILL',
        hardSkillLevel: 'ADVANCED',
      },
    ];

    const result = service.computeAnalysis({
      requirements,
      userCompetencies: user,
      transferEdges: [],
      countryLanguageRelevance: new Map(),
      effortProfiles: new Map(),
      weeklyHours: 8,
    });

    expect(result.analysisItems[0].matchScore).toBe(1);
    expect(result.analysisItems[0].recommendationType).toBe(
      'OPTIONAL_IMPROVEMENT',
    );
  });

  it('returns dual time output with legacy totalPrepMonths', () => {
    const requirements: CompetencyRequirement[] = [
      baseReq({ competencyId: 'linux', competencyName: 'Linux' }),
      baseReq({ competencyId: 'docker', competencyName: 'Docker' }),
    ];

    const effortProfiles = new Map<string, Map<string, number>>([
      ['linux', new Map([['PRACTICAL', 40]])],
      ['docker', new Map([['PRACTICAL', 80]])],
    ]);

    const result = service.computeAnalysis({
      requirements,
      userCompetencies: [],
      transferEdges: [],
      countryLanguageRelevance: new Map(),
      effortProfiles,
      weeklyHours: 8,
    });

    expect(result.totalPrepMonths).toBeGreaterThan(0);
    expect(result.timeEstimate.optimisticHours).toBeGreaterThan(0);
    expect(result.timeEstimate.realisticHours).toBeGreaterThan(0);
    expect(result.timeEstimate.criticalPathHours).toBeGreaterThan(0);
  });
});
