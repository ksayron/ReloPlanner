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

export type ScoringTuningProfileName = 'CONSERVATIVE' | 'STANDARD' | 'AGGRESSIVE';

export const scoringTuningProfiles: Record<ScoringTuningProfileName, ScoringTuningConfig> = {
  CONSERVATIVE: {
    priorityMultiplier: {
      CORE: 1.0,
      IMPORTANT: 0.6,
      OPTIONAL: 0.15,
      CONTEXTUAL: 0.05,
    },
    roleRelevanceMultiplier: {
      CORE: 1.0,
      RELATED: 0.45,
      WEAKLY_RELATED: 0.1,
      IRRELEVANT: 0.0,
    },
    severityImpactThresholds: {
      critical: 0.55,
      high: 0.35,
      moderate: 0.15,
    },
    timeEstimation: {
      optimisticFactor: 0.75,
      weeksPerMonth: 4.3,
    },
  },
  STANDARD: {
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
  },
  AGGRESSIVE: {
    priorityMultiplier: {
      CORE: 1.0,
      IMPORTANT: 0.9,
      OPTIONAL: 0.35,
      CONTEXTUAL: 0.15,
    },
    roleRelevanceMultiplier: {
      CORE: 1.0,
      RELATED: 0.75,
      WEAKLY_RELATED: 0.3,
      IRRELEVANT: 0.0,
    },
    severityImpactThresholds: {
      critical: 0.35,
      high: 0.2,
      moderate: 0.08,
    },
    timeEstimation: {
      optimisticFactor: 0.65,
      weeksPerMonth: 4.3,
    },
  },
};

export const scoringTuningProfileDescriptions: Record<ScoringTuningProfileName, string> = {
  CONSERVATIVE:
    'Stricter severity thresholds and lower optional/context influence. Fewer items escalate to high severity.',
  STANDARD:
    'Current baseline behavior. Matches the previous hardcoded scoring constants.',
  AGGRESSIVE:
    'More sensitive severity and higher influence of non-core signals. Surfaces gaps earlier and estimates faster optimistic timeline.',
};

export const defaultScoringTuningConfig: ScoringTuningConfig =
  scoringTuningProfiles.STANDARD;

export const defaultScoringTuningProfileName: ScoringTuningProfileName = 'STANDARD';

export const defaultScoringTuningProfile = {
  name: defaultScoringTuningProfileName,
  description: scoringTuningProfileDescriptions[defaultScoringTuningProfileName],
  config: scoringTuningProfiles[defaultScoringTuningProfileName],
};

export const isScoringProfileName = (value: string): value is ScoringTuningProfileName =>
  value === 'CONSERVATIVE' || value === 'STANDARD' || value === 'AGGRESSIVE';

export const getScoringProfileConfig = (
  name: ScoringTuningProfileName,
): ScoringTuningConfig => scoringTuningProfiles[name];

export const cloneScoringTuningConfig = (
  config: ScoringTuningConfig,
): ScoringTuningConfig => ({
  priorityMultiplier: {
    ...config.priorityMultiplier,
  },
  roleRelevanceMultiplier: {
    ...config.roleRelevanceMultiplier,
  },
  severityImpactThresholds: {
    ...config.severityImpactThresholds,
  },
  timeEstimation: {
    ...config.timeEstimation,
  },
});

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

