import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AnalysisComputationResult,
  AnalysisItemResult,
  CompetencyRequirement,
  TransferEdge,
  UserCompetencyState,
  RoadmapStepResult,
  TimeEstimate,
  RecommendationType,
} from './scoring.types.js';
import { buildScoringTuningConfig, ScoringTuningConfig } from './scoring.config.js';

const HARD_SKILL_LEVEL_SCORE: Record<string, number> = {
  NONE: 0,
  BASIC: 0.25,
  PRACTICAL: 0.5,
  CONFIDENT: 0.75,
  ADVANCED: 1,
};

const LANGUAGE_LEVEL_SCORE: Record<string, number> = {
  NONE: 0,
  A1: 0.15,
  A2: 0.3,
  B1: 0.5,
  B2: 0.7,
  C1: 0.85,
  C2: 1,
};

function round(value: number, digits = 3): number {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

@Injectable()
export class ScoringService {
  private readonly tuning: ScoringTuningConfig;

  constructor(configService?: ConfigService) {
    this.tuning = buildScoringTuningConfig(configService);
  }

  computeAnalysis(params: {
    requirements: CompetencyRequirement[];
    userCompetencies: UserCompetencyState[];
    transferEdges: TransferEdge[];
    countryLanguageRelevance: Map<string, string>;
    effortProfiles: Map<string, Map<string, number>>;
    weeklyHours: number;
  }): AnalysisComputationResult {
    const {
      requirements,
      userCompetencies,
      transferEdges,
      countryLanguageRelevance,
      effortProfiles,
      weeklyHours,
    } = params;

    const userByCompetency = new Map<string, UserCompetencyState>();
    for (const item of userCompetencies) {
      userByCompetency.set(item.competencyId, item);
    }

    const hardScoreMap = new Map<string, number>();
    for (const user of userCompetencies) {
      if (user.competencyType !== 'HARD_SKILL' && user.competencyType !== 'SOFT_SKILL') continue;
      hardScoreMap.set(user.competencyId, this.getCurrentScore(user));
    }

    for (const edge of transferEdges) {
      const source = hardScoreMap.get(edge.sourceCompetencyId) ?? 0;
      if (source <= 0) continue;
      const derived = source * edge.coefficient;
      const prev = hardScoreMap.get(edge.targetCompetencyId) ?? 0;
      if (derived > prev) hardScoreMap.set(edge.targetCompetencyId, derived);
    }

    const analysisItems: AnalysisItemResult[] = [];
    let weightedSum = 0;
    let weightTotal = 0;

    for (const req of requirements) {
      const user = userByCompetency.get(req.competencyId) ?? null;
      const filteredByCountry =
        req.competencyType === 'LANGUAGE' &&
        (countryLanguageRelevance.get(req.competencyId) ?? 'IRRELEVANT') === 'IRRELEVANT';
      const filteredByRole = req.roleRelevance === 'IRRELEVANT';
      const excluded = filteredByCountry || filteredByRole;

      const requiredScore = this.getRequiredScore(req);
      const directScore = user ? this.getCurrentScore(user) : 0;
      const currentScore =
        req.competencyType === 'HARD_SKILL' || req.competencyType === 'SOFT_SKILL'
          ? Math.max(directScore, hardScoreMap.get(req.competencyId) ?? 0)
          : directScore;
      const matchScore = requiredScore > 0 ? Math.min(currentScore / requiredScore, 1) : 1;

      const weight =
        req.frequency *
        req.importance *
        (this.tuning.priorityMultiplier[req.priority as 'CORE'] ?? 0) *
        (this.tuning.roleRelevanceMultiplier[req.roleRelevance as 'CORE'] ?? 0);

      if (!excluded && weight > 0) {
        weightedSum += matchScore * weight;
        weightTotal += weight;
      }

      const recommendationType = this.getRecommendationType({
        excluded,
        matchScore,
        priority: req.priority,
        roleRelevance: req.roleRelevance,
      });
      const includedInRoadmap = recommendationType === 'ACTIONABLE_GAP';
      const severity = this.classifySeverity({
        gap: Math.max(0, requiredScore - currentScore),
        frequency: req.frequency,
        importance: req.importance,
        priority: req.priority,
        roleRelevance: req.roleRelevance,
        recommendationType,
      });
      const currentLevel = this.displayCurrentLevel(req, user, currentScore);
      const requiredLevel = this.displayRequiredLevel(req);
      const estimatedHours = includedInRoadmap
        ? this.estimateHoursByTransition(req.competencyType, currentLevel, requiredLevel)
        : 0;
      const estimatedMonths = estimatedHours > 0 ? round(estimatedHours / weeklyHours / this.tuning.timeEstimation.weeksPerMonth, 1) : 0;

      analysisItems.push({
        competency: {
          id: req.competencyId,
          name: req.competencyName,
          type: req.competencyType,
          family: req.competencyFamily ?? null,
        },
        priority: req.priority,
        roleRelevance: req.roleRelevance,
        currentLevel,
        requiredLevel,
        normalizedCurrentScore: round(currentScore),
        normalizedRequiredScore: round(requiredScore),
        matchScore: round(matchScore),
        weight: round(weight, 4),
        recommendationType,
        includedInRoadmap,
        reason: this.buildReason(req, recommendationType, filteredByCountry, filteredByRole),
        severity,
        estimatedHours,
        estimatedMonths,
        dependsOnCompetencyIds: [],
      });
    }

    const actionable = analysisItems.filter((x) => x.includedInRoadmap);
    this.attachDependencies(actionable);
    const roadmapSteps = this.buildRoadmap(actionable);
    const timeEstimate = this.buildTimeEstimate(roadmapSteps);

    return {
      fitScore: weightTotal > 0 ? round(weightedSum / weightTotal) : 0,
      analysisItems,
      fitScoreContributors: analysisItems
        .filter((x) => x.recommendationType !== 'EXCLUDED_AS_IRRELEVANT')
        .sort((a, b) => b.weight - a.weight)
        .map((x) => ({
          competencyId: x.competency.id,
          competencyName: x.competency.name,
          matchScore: x.matchScore,
          weight: x.weight,
          recommendationType: x.recommendationType,
          reason: x.reason,
        })),
      actionableGaps: actionable,
      marketContext: analysisItems.filter(
        (x) =>
          x.recommendationType === 'MARKET_CONTEXT' ||
          x.recommendationType === 'OPTIONAL_IMPROVEMENT' ||
          x.recommendationType === 'EXCLUDED_AS_IRRELEVANT',
      ),
      roadmapSteps,
      totalPrepMonths: round(timeEstimate.criticalPathHours / weeklyHours / this.tuning.timeEstimation.weeksPerMonth, 1),
      timeEstimate,
    };
  }

  private getCurrentScore(user: UserCompetencyState): number {
    if (user.competencyType === 'LANGUAGE') {
      return LANGUAGE_LEVEL_SCORE[user.languageLevel ?? 'NONE'] ?? 0;
    }

    if (user.competencyType === 'CERTIFICATION') {
      switch (user.certificationStatus ?? 'NONE') {
        case 'OBTAINED':
          return 1;
        case 'IN_PROGRESS':
          return 0.5;
        case 'PLANNED':
          return 0.25;
        case 'EXPIRED':
          return 0.25;
        case 'NONE':
        default:
          return 0;
      }
    }

    return HARD_SKILL_LEVEL_SCORE[user.hardSkillLevel ?? 'NONE'] ?? 0;
  }

  private getRequiredScore(req: CompetencyRequirement): number {
    if (req.competencyType === 'LANGUAGE') {
      return LANGUAGE_LEVEL_SCORE[req.languageRequiredLevel ?? 'NONE'] ?? 0;
    }
    if (req.competencyType === 'CERTIFICATION') {
      switch (req.certificationRequirementLevel ?? 'OPTIONAL') {
        case 'REQUIRED':
          return 1;
        case 'PREFERRED':
          return 0.75;
        case 'OPTIONAL':
        default:
          return 0.5;
      }
    }
    return HARD_SKILL_LEVEL_SCORE[req.hardSkillRequiredLevel ?? 'NONE'] ?? 0;
  }

  private getRecommendationType(args: {
    excluded: boolean;
    matchScore: number;
    priority: string;
    roleRelevance: string;
  }): RecommendationType {
    if (args.excluded) return 'EXCLUDED_AS_IRRELEVANT';
    if (args.matchScore >= 1) return 'MARKET_CONTEXT';
    if (
      (args.priority === 'CORE' || args.priority === 'IMPORTANT') &&
      (args.roleRelevance === 'CORE' || args.roleRelevance === 'RELATED')
    ) {
      return 'ACTIONABLE_GAP';
    }
    if (args.priority === 'OPTIONAL') return 'OPTIONAL_IMPROVEMENT';
    return 'MARKET_CONTEXT';
  }

  private classifySeverity(args: {
    gap: number;
    frequency: number;
    importance: number;
    priority: string;
    roleRelevance: string;
    recommendationType: RecommendationType;
  }): 'CRITICAL' | 'HIGH' | 'MODERATE' | 'MINOR' {
    if (args.recommendationType !== 'ACTIONABLE_GAP') return 'MINOR';
    const impact =
      args.gap *
      args.frequency *
      args.importance *
      (this.tuning.priorityMultiplier[args.priority as 'CORE'] ?? 0) *
      (this.tuning.roleRelevanceMultiplier[args.roleRelevance as 'CORE'] ?? 0);

    if (impact >= this.tuning.severityImpactThresholds.critical) return 'CRITICAL';
    if (impact >= this.tuning.severityImpactThresholds.high) return 'HIGH';
    if (impact >= this.tuning.severityImpactThresholds.moderate) return 'MODERATE';
    return 'MINOR';
  }

  private displayCurrentLevel(
    req: CompetencyRequirement,
    user: UserCompetencyState | null,
    score: number,
  ): string {
    if (!user) return 'NONE';
    if (req.competencyType === 'LANGUAGE') return user.languageLevel ?? 'NONE';
    if (req.competencyType === 'CERTIFICATION') return user.certificationStatus ?? 'NONE';

    if (user.hardSkillLevel) return user.hardSkillLevel;
    if (score >= 0.75) return 'CONFIDENT';
    if (score >= 0.5) return 'PRACTICAL';
    if (score >= 0.25) return 'BASIC';
    return 'NONE';
  }

  private displayRequiredLevel(req: CompetencyRequirement): string {
    if (req.competencyType === 'LANGUAGE') return req.languageRequiredLevel ?? 'NONE';
    if (req.competencyType === 'CERTIFICATION') return req.requiredCertificationStatus ?? 'OBTAINED';
    return req.hardSkillRequiredLevel ?? 'NONE';
  }

  private estimateHoursByTransition(
    competencyType: string,
    currentLevel: string,
    requiredLevel: string,
  ): number {
    const hardOrder = ['NONE', 'BASIC', 'PRACTICAL', 'CONFIDENT', 'ADVANCED'];
    const hardStepHours = [20, 60, 80, 120]; // N->B, B->P, P->C, C->A

    const languageOrder = ['NONE', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const languageStepHours = [80, 100, 160, 220, 300, 380];

    const certOrder = ['NONE', 'PLANNED', 'IN_PROGRESS', 'OBTAINED'];
    const certStepHours = [10, 30, 50];

    const sumRange = (fromIdx: number, toIdx: number, steps: number[]) => {
      if (fromIdx >= toIdx) return 0;
      let total = 0;
      for (let i = fromIdx; i < toIdx; i++) total += steps[i] ?? 0;
      return total;
    };

    if (competencyType === 'LANGUAGE') {
      const from = Math.max(0, languageOrder.indexOf(currentLevel));
      const to = Math.max(0, languageOrder.indexOf(requiredLevel));
      return sumRange(from, to, languageStepHours);
    }

    if (competencyType === 'CERTIFICATION') {
      const norm = (lvl: string) => (lvl === 'EXPIRED' ? 'IN_PROGRESS' : lvl);
      const from = Math.max(0, certOrder.indexOf(norm(currentLevel)));
      const to = Math.max(0, certOrder.indexOf(norm(requiredLevel)));
      return sumRange(from, to, certStepHours);
    }

    const from = Math.max(0, hardOrder.indexOf(currentLevel));
    const to = Math.max(0, hardOrder.indexOf(requiredLevel));
    return sumRange(from, to, hardStepHours);
  }

  private buildReason(
    req: CompetencyRequirement,
    recommendationType: RecommendationType,
    filteredByCountry: boolean,
    filteredByRole: boolean,
  ): string {
    if (filteredByCountry) {
      return `${req.competencyName} excluded: not relevant language for selected country context.`;
    }
    if (filteredByRole) {
      return `${req.competencyName} excluded: role relevance is IRRELEVANT for selected role.`;
    }
    if (recommendationType === 'ACTIONABLE_GAP') {
      return `${req.competencyName} is ${req.priority.toLowerCase()} and role-relevant; added as actionable roadmap gap.`;
    }
    if (recommendationType === 'OPTIONAL_IMPROVEMENT') {
      return `${req.competencyName} is optional for the selected role and shown as improvement context.`;
    }
    return `${req.competencyName} contributes to market context but is not a primary roadmap driver.`;
  }

  private attachDependencies(actionable: AnalysisItemResult[]) {
    const byName = new Map(actionable.map((x) => [x.competency.name, x.competency.id]));

    for (const item of actionable) {
      const deps: string[] = [];
      if (item.competency.name === 'Kubernetes') {
        if (byName.has('Docker')) deps.push(byName.get('Docker')!);
        if (byName.has('Linux')) deps.push(byName.get('Linux')!);
      }
      if (item.competency.name === 'Terraform') {
        if (byName.has('AWS')) deps.push(byName.get('AWS')!);
        if (byName.has('Azure')) deps.push(byName.get('Azure')!);
      }
      if (item.competency.name === 'Docker' && byName.has('Linux')) {
        deps.push(byName.get('Linux')!);
      }
      item.dependsOnCompetencyIds = [...new Set(deps)];
    }
  }

  private buildRoadmap(actionable: AnalysisItemResult[]): RoadmapStepResult[] {
    const pending = new Map<string, AnalysisItemResult>();
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, string[]>();

    for (const item of actionable) {
      pending.set(item.competency.id, item);
      incoming.set(item.competency.id, item.dependsOnCompetencyIds.length);
      for (const dep of item.dependsOnCompetencyIds) {
        const list = outgoing.get(dep) ?? [];
        list.push(item.competency.id);
        outgoing.set(dep, list);
      }
    }

    const queue = actionable
      .filter((x) => (incoming.get(x.competency.id) ?? 0) === 0)
      .sort((a, b) => b.weight - a.weight);

    const ordered: RoadmapStepResult[] = [];
    let index = 0;
    while (queue.length > 0) {
      const cur = queue.shift()!;
      ordered.push({
        id: `${cur.competency.id}-${index}`,
        competencyId: cur.competency.id,
        competencyName: cur.competency.name,
        priority: cur.priority,
        roleRelevance: cur.roleRelevance,
        recommendationType: cur.recommendationType,
        currentDisplayLevel: cur.currentLevel,
        requiredDisplayLevel: cur.requiredLevel,
          estimatedHours: cur.estimatedHours,
          orderIndex: index++,
        dependsOn: cur.dependsOnCompetencyIds,
        reason: cur.reason,
        status: 'PENDING',
      });

      for (const dep of outgoing.get(cur.competency.id) ?? []) {
        const next = (incoming.get(dep) ?? 0) - 1;
        incoming.set(dep, next);
        if (next === 0) {
          const node = pending.get(dep);
          if (node) queue.push(node);
        }
      }
    }

    if (ordered.length !== actionable.length) {
      // fallback to stable sorted order if cyclic dependencies appear
      return actionable
        .sort((a, b) => b.weight - a.weight)
        .map((cur, i) => ({
          id: `${cur.competency.id}-${i}`,
          competencyId: cur.competency.id,
          competencyName: cur.competency.name,
          priority: cur.priority,
          roleRelevance: cur.roleRelevance,
          recommendationType: cur.recommendationType,
          currentDisplayLevel: cur.currentLevel,
          requiredDisplayLevel: cur.requiredLevel,
          estimatedHours: cur.estimatedHours,
          orderIndex: i,
          dependsOn: [],
          reason: cur.reason,
          status: 'PENDING',
        }));
    }

    return ordered;
  }

  private buildTimeEstimate(roadmapSteps: RoadmapStepResult[]): TimeEstimate {
    const totalHours = roadmapSteps.reduce((acc, x) => acc + x.estimatedHours, 0);
    const realisticHours = totalHours;
    const optimisticHours = totalHours > 0 ? round(totalHours * this.tuning.timeEstimation.optimisticFactor, 1) : 0;
    const criticalPathHours = this.computeCriticalPathHours(roadmapSteps);

    return {
      optimisticHours,
      realisticHours,
      criticalPathHours,
    };
  }

  private computeCriticalPathHours(steps: RoadmapStepResult[]): number {
    const durationById = new Map<string, number>();
    const stepByCompId = new Map<string, RoadmapStepResult>();
    for (const step of steps) {
      durationById.set(step.competencyId, step.estimatedHours);
      stepByCompId.set(step.competencyId, step);
    }

    const memo = new Map<string, number>();
    const dfs = (id: string): number => {
      if (memo.has(id)) return memo.get(id)!;
      const step = stepByCompId.get(id);
      if (!step) return 0;

      let bestDep = 0;
      for (const dep of step.dependsOn) {
        bestDep = Math.max(bestDep, dfs(dep));
      }
      const value = bestDep + (durationById.get(id) ?? 0);
      memo.set(id, value);
      return value;
    };

    let max = 0;
    for (const step of steps) {
      max = Math.max(max, dfs(step.competencyId));
    }
    return round(max, 1);
  }
}

