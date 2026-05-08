import { ConfigService } from '@nestjs/config';

export interface ScoringTuningConfig {
  priorityMultiplier: Record<'CORE' | 'IMPORTANT' | 'OPTIONAL' | 'CONTEXTUAL', number>;
  roleRelevanceMultiplier: Record<'CORE' | 'RELATED' | 'WEAKLY_RELATED' | 'IRRELEVANT', number>;
  severityImpactThresholds: {
    critical: number;
    high: number;
    moderate: number;
  };
  timeEstimation: {
    optimisticFactor: number;
    weeksPerMonth: number;
  };
}

export const defaultScoringTuningConfig: ScoringTuningConfig = {
  priorityMultiplier: {
    CORE: 1.0,
    IMPORTANT: 0.75,
    OPTIONAL: 0.25,
    CONTEXTUAL: 0.1,
  },
  roleRelevanceMultiplier: {
    CORE: 1.0,
    RELATED: 0.6,
    WEAKLY_RELATED: 0.2,
    IRRELEVANT: 0.0,
  },
  severityImpactThresholds: {
    critical: 0.45,
    high: 0.25,
    moderate: 0.1,
  },
  timeEstimation: {
    optimisticFactor: 0.7,
    weeksPerMonth: 4.3,
  },
};

export function buildScoringTuningConfig(
  configService?: ConfigService,
): ScoringTuningConfig {
  const env = (key: string): number | undefined => {
    if (!configService) return undefined;
    const raw = configService.get<string>(key);
    if (raw == null || raw === '') return undefined;
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid numeric value for ${key}: "${raw}"`);
    }
    return value;
  };

  const cfg: ScoringTuningConfig = {
    priorityMultiplier: {
      CORE: env('SCORING_PRIORITY_CORE') ?? defaultScoringTuningConfig.priorityMultiplier.CORE,
      IMPORTANT:
        env('SCORING_PRIORITY_IMPORTANT') ??
        defaultScoringTuningConfig.priorityMultiplier.IMPORTANT,
      OPTIONAL:
        env('SCORING_PRIORITY_OPTIONAL') ??
        defaultScoringTuningConfig.priorityMultiplier.OPTIONAL,
      CONTEXTUAL:
        env('SCORING_PRIORITY_CONTEXTUAL') ??
        defaultScoringTuningConfig.priorityMultiplier.CONTEXTUAL,
    },
    roleRelevanceMultiplier: {
      CORE:
        env('SCORING_ROLE_RELEVANCE_CORE') ??
        defaultScoringTuningConfig.roleRelevanceMultiplier.CORE,
      RELATED:
        env('SCORING_ROLE_RELEVANCE_RELATED') ??
        defaultScoringTuningConfig.roleRelevanceMultiplier.RELATED,
      WEAKLY_RELATED:
        env('SCORING_ROLE_RELEVANCE_WEAKLY_RELATED') ??
        defaultScoringTuningConfig.roleRelevanceMultiplier.WEAKLY_RELATED,
      IRRELEVANT:
        env('SCORING_ROLE_RELEVANCE_IRRELEVANT') ??
        defaultScoringTuningConfig.roleRelevanceMultiplier.IRRELEVANT,
    },
    severityImpactThresholds: {
      critical:
        env('SCORING_SEVERITY_CRITICAL_THRESHOLD') ??
        defaultScoringTuningConfig.severityImpactThresholds.critical,
      high:
        env('SCORING_SEVERITY_HIGH_THRESHOLD') ??
        defaultScoringTuningConfig.severityImpactThresholds.high,
      moderate:
        env('SCORING_SEVERITY_MODERATE_THRESHOLD') ??
        defaultScoringTuningConfig.severityImpactThresholds.moderate,
    },
    timeEstimation: {
      optimisticFactor:
        env('SCORING_TIME_OPTIMISTIC_FACTOR') ??
        defaultScoringTuningConfig.timeEstimation.optimisticFactor,
      weeksPerMonth:
        env('SCORING_TIME_WEEKS_PER_MONTH') ??
        defaultScoringTuningConfig.timeEstimation.weeksPerMonth,
    },
  };

  validateScoringTuningConfig(cfg);
  return cfg;
}

function validateScoringTuningConfig(cfg: ScoringTuningConfig) {
  const multipliers = [
    ...Object.values(cfg.priorityMultiplier),
    ...Object.values(cfg.roleRelevanceMultiplier),
  ];
  for (const value of multipliers) {
    if (value < 0 || value > 2) {
      throw new Error(
        `Scoring multiplier out of range [0..2]: ${value}. Check SCORING_* multiplier variables.`,
      );
    }
  }

  const thresholds = cfg.severityImpactThresholds;
  if (!(thresholds.critical > thresholds.high && thresholds.high > thresholds.moderate)) {
    throw new Error(
      `Invalid scoring severity thresholds: expected critical > high > moderate, got ${thresholds.critical} / ${thresholds.high} / ${thresholds.moderate}`,
    );
  }
  if (thresholds.moderate <= 0) {
    throw new Error(`Invalid SCORING_SEVERITY_MODERATE_THRESHOLD: must be > 0`);
  }

  if (cfg.timeEstimation.optimisticFactor <= 0 || cfg.timeEstimation.optimisticFactor > 1) {
    throw new Error(`Invalid SCORING_TIME_OPTIMISTIC_FACTOR: expected (0..1]`);
  }
  if (cfg.timeEstimation.weeksPerMonth <= 0) {
    throw new Error(`Invalid SCORING_TIME_WEEKS_PER_MONTH: must be > 0`);
  }
}

