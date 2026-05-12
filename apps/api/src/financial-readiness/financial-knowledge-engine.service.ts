import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CostCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { EvaluateFinancialReadinessDto } from './financial-readiness.dto.js';
import { buildFinancialRuleRegistry } from './financial-rule-registry.js';
import type {
  FinancialAdvice,
  FinancialCostCategoryEstimate,
  FinancialCostEstimate,
  FinancialReadinessFacts,
  FinancialReadinessResult,
  FinancialRiskLevel,
  FinancialWarning,
} from './financial-readiness.types.js';

const COST_CATEGORIES: CostCategory[] = [
  'RENT',
  'FOOD',
  'TRANSPORT',
  'UTILITIES',
  'OTHER',
];

type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'PLN' | 'UAH';
type LifestyleProfile = 'FRUGAL' | 'STANDARD' | 'COMFORTABLE';

const DEFAULT_LIFESTYLE_MULTIPLIERS: Record<LifestyleProfile, number> = {
  FRUGAL: 0.85,
  STANDARD: 1,
  COMFORTABLE: 1.25,
};

const DEFAULT_CURRENCY_RATES_TO_USD: Record<CurrencyCode, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  CAD: 0.73,
  PLN: 0.25,
  UAH: 0.024,
};

@Injectable()
export class FinancialKnowledgeEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async evaluate(
    input: EvaluateFinancialReadinessDto,
  ): Promise<FinancialReadinessResult> {
    const lifestyle = input.lifestyle ?? 'STANDARD';
    const dependentsCount = input.dependentsCount ?? 0;
    const jobSearchMonths = input.jobSearchMonths ?? 6;
    const costEstimateRaw = await this.loadCostEstimate(
      input.targetCountry,
      input.targetCity ?? null,
    );

    const lifestyleMultiplier = this.getLifestyleMultiplier(lifestyle);
    const dependentsMultiplier =
      1 + dependentsCount * this.getDependentCostFactor();
    const totalMonthlyEstimateUsd = this.round(
      costEstimateRaw.totalMonthlyEstimateUsd *
        lifestyleMultiplier *
        dependentsMultiplier,
      2,
    );

    const monthlyBudgetUsd = this.convertToUsd(
      input.monthlyBudgetAmount ?? null,
      input.monthlyBudgetCurrency ?? null,
    );
    const expectedNetSalaryUsd = this.convertToUsd(
      input.expectedNetSalaryAmount ?? null,
      input.expectedNetSalaryCurrency ?? null,
    );
    const savingsUsd = this.convertToUsd(
      input.savingsAmount ?? null,
      input.savingsCurrency ?? null,
    );

    const effectiveMonthlyNeedUsd = this.round(
      Math.max(totalMonthlyEstimateUsd, monthlyBudgetUsd ?? 0),
      2,
    );
    const runwayMonths =
      savingsUsd !== null && effectiveMonthlyNeedUsd > 0
        ? this.round(savingsUsd / effectiveMonthlyNeedUsd, 1)
        : null;

    const minimumRunwayMonths = this.getMinimumRunwayMonths();
    const recommendedSavingsUsd = this.round(
      effectiveMonthlyNeedUsd * Math.max(jobSearchMonths, minimumRunwayMonths),
      2,
    );

    const costEstimate: FinancialCostEstimate = {
      source: costEstimateRaw.source,
      categories: costEstimateRaw.categories.map((item) => ({
        category: item.category,
        monthlyAmountUsd: this.round(
          item.monthlyAmountUsd * lifestyleMultiplier * dependentsMultiplier,
          2,
        ),
      })),
      totalMonthlyEstimateUsd,
      appliedLifestyleMultiplier: lifestyleMultiplier,
      appliedDependentsMultiplier: dependentsMultiplier,
    };

    const facts: FinancialReadinessFacts = {
      targetCountry: (input.targetCountry ?? '').trim().toUpperCase(),
      targetCity: input.targetCity ?? null,
      savingsUsd,
      monthlyBudgetUsd,
      expectedNetSalaryUsd,
      dependentsCount,
      jobSearchMonths,
      colEstimate: costEstimate,
      effectiveMonthlyNeedUsd,
      runwayMonths,
      recommendedSavingsUsd,
    };

    const triggeredRules: Array<{ code: string; description: string }> = [];
    const warnings: FinancialWarning[] = [];
    const advice: FinancialAdvice[] = [];
    const riskLevels: FinancialRiskLevel[] = [];
    let riskShift = 0;

    for (const rule of buildFinancialRuleRegistry()) {
      if (!rule.when(facts)) continue;
      const result = rule.then(facts);
      triggeredRules.push({ code: rule.code, description: rule.description });
      if (result.riskLevel) riskLevels.push(result.riskLevel);
      riskShift += result.riskShift ?? 0;
      warnings.push(...(result.warnings ?? []));
      advice.push(...(result.advice ?? []));
    }

    const financialRiskLevel = this.resolveRiskLevel(riskLevels, riskShift);
    const summary = this.buildSummary(facts, financialRiskLevel);

    return {
      targetCountry: facts.targetCountry,
      targetCity: facts.targetCity ?? null,
      financialRiskLevel,
      runwayMonths: facts.runwayMonths,
      recommendedSavingsAmount: facts.recommendedSavingsUsd,
      recommendedSavingsCurrency: 'USD',
      costEstimate,
      triggeredRules,
      warnings: this.uniqueByCode(warnings),
      advice: this.uniqueByCode(advice),
      summary,
    };
  }

  private async loadCostEstimate(
    targetCountryRaw: string,
    targetCityRaw: string | null,
  ): Promise<FinancialCostEstimate> {
    const targetCountry = (targetCountryRaw ?? '').trim().toUpperCase();
    const targetCity = (targetCityRaw ?? '').trim();

    if (targetCountry && targetCity) {
      const cityRows = await this.prisma.costOfLivingData.findMany({
        where: {
          country: targetCountry,
          city: targetCity,
        },
      });
      const fromCity = this.buildEstimateFromRows(cityRows, 'CITY');
      if (fromCity) return fromCity;
    }

    if (targetCountry) {
      const countryRows = await this.prisma.costOfLivingData.groupBy({
        by: ['category'],
        where: { country: targetCountry },
        _avg: { avgMonthlyUsd: true },
      });
      const byCategory = countryRows.map((row) => ({
        category: row.category,
        avgMonthlyUsd: Number(row._avg.avgMonthlyUsd ?? 0),
      }));
      const fromCountry = this.buildEstimateFromAggregates(byCategory, 'COUNTRY');
      if (fromCountry) return fromCountry;
    }

    const globalRows = await this.prisma.costOfLivingData.groupBy({
      by: ['category'],
      _avg: { avgMonthlyUsd: true },
    });
    const globalByCategory = globalRows.map((row) => ({
      category: row.category,
      avgMonthlyUsd: Number(row._avg.avgMonthlyUsd ?? 0),
    }));
    return (
      this.buildEstimateFromAggregates(globalByCategory, 'GLOBAL') ?? {
        source: 'GLOBAL',
        categories: COST_CATEGORIES.map((category) => ({
          category,
          monthlyAmountUsd: 0,
        })),
        totalMonthlyEstimateUsd: 0,
        appliedLifestyleMultiplier: 1,
        appliedDependentsMultiplier: 1,
      }
    );
  }

  private buildEstimateFromRows(
    rows: Array<{ category: CostCategory; avgMonthlyUsd: unknown }>,
    source: 'CITY',
  ): FinancialCostEstimate | null {
    if (rows.length === 0) return null;
    const categories = this.fillCategories(
      rows.map((row) => ({
        category: row.category,
        monthlyAmountUsd: Number(row.avgMonthlyUsd ?? 0),
      })),
    );
    return {
      source,
      categories,
      totalMonthlyEstimateUsd: this.round(
        categories.reduce((acc, item) => acc + item.monthlyAmountUsd, 0),
        2,
      ),
      appliedLifestyleMultiplier: 1,
      appliedDependentsMultiplier: 1,
    };
  }

  private buildEstimateFromAggregates(
    rows: Array<{ category: CostCategory; avgMonthlyUsd: number }>,
    source: 'COUNTRY' | 'GLOBAL',
  ): FinancialCostEstimate | null {
    if (rows.length === 0) return null;
    const categories = this.fillCategories(
      rows.map((row) => ({
        category: row.category,
        monthlyAmountUsd: Number(row.avgMonthlyUsd ?? 0),
      })),
    );
    return {
      source,
      categories,
      totalMonthlyEstimateUsd: this.round(
        categories.reduce((acc, item) => acc + item.monthlyAmountUsd, 0),
        2,
      ),
      appliedLifestyleMultiplier: 1,
      appliedDependentsMultiplier: 1,
    };
  }

  private fillCategories(
    categories: FinancialCostCategoryEstimate[],
  ): FinancialCostCategoryEstimate[] {
    const byCategory = new Map(
      categories.map((item) => [item.category, this.round(item.monthlyAmountUsd, 2)]),
    );
    return COST_CATEGORIES.map((category) => ({
      category,
      monthlyAmountUsd: byCategory.get(category) ?? 0,
    }));
  }

  private convertToUsd(
    amount: number | null,
    currency: CurrencyCode | null,
  ): number | null {
    if (amount === null || amount === undefined) return null;
    const targetCurrency = currency ?? 'USD';
    const rate = this.getCurrencyRatesToUsd()[targetCurrency] ?? 1;
    return this.round(amount * rate, 2);
  }

  private getLifestyleMultiplier(lifestyle: LifestyleProfile): number {
    const raw = this.config.get<string>('FINANCIAL_LIFESTYLE_MULTIPLIERS');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<Record<LifestyleProfile, number>>;
        const value = parsed[lifestyle];
        if (typeof value === 'number' && value > 0) return value;
      } catch {
        // ignore malformed override and use defaults
      }
    }
    return DEFAULT_LIFESTYLE_MULTIPLIERS[lifestyle];
  }

  private getDependentCostFactor(): number {
    const value = Number(this.config.get('FINANCIAL_DEPENDENT_COST_FACTOR') ?? 0.25);
    return Number.isFinite(value) && value >= 0 ? value : 0.25;
  }

  private getMinimumRunwayMonths(): number {
    const value = Number(this.config.get('FINANCIAL_MIN_RUNWAY_MONTHS') ?? 6);
    return Number.isFinite(value) && value > 0 ? value : 6;
  }

  private getCurrencyRatesToUsd(): Record<CurrencyCode, number> {
    const raw = this.config.get<string>('FINANCIAL_CURRENCY_RATES_TO_USD');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<Record<CurrencyCode, number>>;
        const merged: Record<CurrencyCode, number> = {
          ...DEFAULT_CURRENCY_RATES_TO_USD,
        };
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === 'number' && value > 0) {
            merged[key as CurrencyCode] = value;
          }
        }
        return merged;
      } catch {
        // ignore malformed override and use defaults
      }
    }
    return DEFAULT_CURRENCY_RATES_TO_USD;
  }

  private resolveRiskLevel(
    levels: FinancialRiskLevel[],
    shift: number,
  ): FinancialRiskLevel {
    const hasHigh = levels.includes('HIGH');
    const hasModerate = levels.includes('MODERATE');
    const hasUnknown = levels.includes('UNKNOWN');

    let score = hasHigh ? 3 : hasModerate ? 2 : hasUnknown ? 0 : 1;
    score = Math.max(1, Math.min(3, score + shift));

    if (score >= 3) return 'HIGH';
    if (score === 2) return 'MODERATE';
    return 'LOW';
  }

  private buildSummary(
    facts: FinancialReadinessFacts,
    risk: FinancialRiskLevel,
  ): string {
    const runwayText =
      facts.runwayMonths === null
        ? 'Runway could not be estimated from provided inputs.'
        : `Estimated runway: ${facts.runwayMonths.toFixed(1)} months.`;
    return `Financial risk is ${risk}. ${runwayText} Estimated monthly need is ${facts.effectiveMonthlyNeedUsd.toFixed(2)} USD.`;
  }

  private uniqueByCode<T extends { code: string }>(values: T[]): T[] {
    const seen = new Set<string>();
    const result: T[] = [];
    for (const value of values) {
      if (!value.code || seen.has(value.code)) continue;
      seen.add(value.code);
      result.push(value);
    }
    return result;
  }

  private round(value: number, digits = 2): number {
    const p = 10 ** digits;
    return Math.round(value * p) / p;
  }
}
