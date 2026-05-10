import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EvaluateLegalReadinessDto } from './legal-readiness.dto.js';
import { LegalKnowledgeEngineService } from './legal-knowledge-engine.service.js';

@Injectable()
export class LegalReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: LegalKnowledgeEngineService,
  ) {}

  evaluate(dto: EvaluateLegalReadinessDto) {
    return this.engine.evaluate(dto);
  }

  async evaluateForProfile(profileId: string, userId: string) {
    const profile = await this.prisma.relocationProfile.findFirst({
      where: {
        id: profileId,
        userId,
      },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return this.engine.evaluate({
      sourceCountry: profile.currentCountry,
      targetCountry: profile.targetCountry,
      targetCity: profile.targetCity ?? undefined,
      desiredRole: profile.desiredRole ?? undefined,
    });
  }
}
