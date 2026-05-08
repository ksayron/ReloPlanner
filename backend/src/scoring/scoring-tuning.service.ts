import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  cloneScoringTuningConfig,
  defaultScoringTuningProfileName,
  getScoringProfileConfig,
  isScoringProfileName,
  ScoringTuningConfig,
  ScoringTuningProfileName,
  scoringTuningProfileDescriptions,
  scoringTuningProfiles,
} from './scoring.config.js';

@Injectable()
export class ScoringTuningService {
  private activeProfile: ScoringTuningProfileName = defaultScoringTuningProfileName;
  private activeConfig: ScoringTuningConfig = cloneScoringTuningConfig(
    getScoringProfileConfig(defaultScoringTuningProfileName),
  );

  constructor(private readonly configService: ConfigService) {
    const configured = String(
      this.configService.get('SCORING_TUNING_PROFILE') ??
        defaultScoringTuningProfileName,
    ).toUpperCase();

    if (isScoringProfileName(configured)) {
      this.activeProfile = configured;
      this.activeConfig = cloneScoringTuningConfig(getScoringProfileConfig(configured));
    }
  }

  getActiveProfile() {
    return {
      name: this.activeProfile,
      description: scoringTuningProfileDescriptions[this.activeProfile],
      config: cloneScoringTuningConfig(this.activeConfig),
    };
  }

  getActiveConfig(): ScoringTuningConfig {
    return cloneScoringTuningConfig(this.activeConfig);
  }

  listProfiles() {
    return (Object.keys(scoringTuningProfiles) as ScoringTuningProfileName[]).map(
      (name) => ({
        name,
        description: scoringTuningProfileDescriptions[name],
        config: cloneScoringTuningConfig(scoringTuningProfiles[name]),
      }),
    );
  }

  setActiveProfile(profile: string) {
    const next = profile.toUpperCase();
    if (!isScoringProfileName(next)) {
      throw new BadRequestException(`Unknown scoring tuning profile: ${profile}`);
    }
    this.activeProfile = next;
    this.activeConfig = cloneScoringTuningConfig(getScoringProfileConfig(next));
    return this.getActiveProfile();
  }
}

