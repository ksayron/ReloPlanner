import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AI_PROVIDERS,
  AiProviderName,
  AiRoutingPolicy,
  AiRoutingPolicyView,
  AiTaskGrade,
  isAiProviderName,
} from './ai.types.js';

@Injectable()
export class AiRoutingService {
  private policy: AiRoutingPolicy;

  constructor(private readonly configService: ConfigService) {
    this.policy = {
      defaults: {
        EASY: this.readProviderFromEnv('AI_DEFAULT_PROVIDER_EASY', 'OPENROUTER'),
        REASONING: this.readProviderFromEnv('AI_DEFAULT_PROVIDER_REASONING', 'OPENAI'),
      },
    };
  }

  getPolicy(): AiRoutingPolicyView {
    return {
      defaults: { ...this.policy.defaults },
      orders: {
        EASY: this.resolveProviderOrder('EASY'),
        REASONING: this.resolveProviderOrder('REASONING'),
      },
      availableProviders: [...AI_PROVIDERS],
    };
  }

  setDefaultProvider(grade: AiTaskGrade, provider: AiProviderName): AiRoutingPolicyView {
    this.policy.defaults[grade] = provider;
    return this.getPolicy();
  }

  resolveProviderOrder(grade: AiTaskGrade): AiProviderName[] {
    const primary = this.policy.defaults[grade];
    if (primary === 'MOCK') return ['MOCK'];

    const alternates = AI_PROVIDERS.filter((name) => name !== primary && name !== 'MOCK');
    return [primary, ...alternates, 'MOCK'];
  }

  private readProviderFromEnv(key: string, fallback: AiProviderName): AiProviderName {
    const raw = String(this.configService.get<string>(key) ?? fallback).trim().toUpperCase();
    if (!isAiProviderName(raw)) {
      throw new BadRequestException(
        `${key} must be one of ${AI_PROVIDERS.join(', ')}, got "${raw}"`,
      );
    }
    return raw;
  }
}
