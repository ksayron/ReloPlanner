import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EvaluateFinancialReadinessDto } from './financial-readiness.dto.js';
import { FinancialKnowledgeEngineService } from './financial-knowledge-engine.service.js';

@Injectable()
export class FinancialReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: FinancialKnowledgeEngineService,
  ) {}

  evaluate(dto: EvaluateFinancialReadinessDto) {
    return this.engine.evaluate(dto);
  }

  async evaluateForProfile(profileId: string, userId: string) {
    const profile = (await this.prisma.relocationProfile.findFirst({
      where: {
        id: profileId,
        userId,
      },
    })) as any;

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return this.engine.evaluate({
      targetCountry: profile.targetCountry,
      targetCity: profile.targetCity ?? undefined,
      savingsAmount: profile.savingsAmount ? Number(profile.savingsAmount) : undefined,
      savingsCurrency: profile.savingsCurrency ?? undefined,
      monthlyBudgetAmount: profile.monthlyBudgetAmount
        ? Number(profile.monthlyBudgetAmount)
        : undefined,
      monthlyBudgetCurrency: profile.monthlyBudgetCurrency ?? undefined,
      expectedNetSalaryAmount: profile.expectedNetSalaryAmount
        ? Number(profile.expectedNetSalaryAmount)
        : undefined,
      expectedNetSalaryCurrency: profile.expectedNetSalaryCurrency ?? undefined,
      dependentsCount: profile.dependentsCount ?? undefined,
      lifestyle: profile.lifestyle ?? undefined,
      jobSearchMonths: profile.jobSearchMonths ?? undefined,
    });
  }
}
