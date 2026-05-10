import type { CostCategory } from '@prisma/client';

export type FinancialRiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'UNKNOWN';

export type CostEstimateSource = 'CITY' | 'COUNTRY' | 'GLOBAL';

export interface FinancialCostCategoryEstimate {
  category: CostCategory;
  monthlyAmountUsd: number;
}

export interface FinancialCostEstimate {
  source: CostEstimateSource;
  categories: FinancialCostCategoryEstimate[];
  totalMonthlyEstimateUsd: number;
  appliedLifestyleMultiplier: number;
  appliedDependentsMultiplier: number;
}

export interface FinancialReadinessFacts {
  targetCountry: string;
  targetCity?: string | null;
  savingsUsd: number | null;
  monthlyBudgetUsd: number | null;
  expectedNetSalaryUsd: number | null;
  dependentsCount: number;
  jobSearchMonths: number;
  colEstimate: FinancialCostEstimate;
  effectiveMonthlyNeedUsd: number;
  runwayMonths: number | null;
  recommendedSavingsUsd: number;
}

export interface TriggeredFinancialRule {
  code: string;
  description: string;
}

export interface FinancialAdvice {
  code: string;
  message: string;
}

export interface FinancialWarning {
  code: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  message: string;
}

export interface FinancialRuleResult {
  ruleCode: string;
  riskLevel?: FinancialRiskLevel;
  riskShift?: -1 | 1;
  warnings?: FinancialWarning[];
  advice?: FinancialAdvice[];
}

export interface FinancialReadinessRule {
  code: string;
  description: string;
  when: (facts: FinancialReadinessFacts) => boolean;
  then: (facts: FinancialReadinessFacts) => Omit<FinancialRuleResult, 'ruleCode'>;
}

export interface FinancialReadinessResult {
  targetCountry: string;
  targetCity: string | null;
  financialRiskLevel: FinancialRiskLevel;
  runwayMonths: number | null;
  recommendedSavingsAmount: number;
  recommendedSavingsCurrency: 'USD';
  costEstimate: FinancialCostEstimate;
  triggeredRules: TriggeredFinancialRule[];
  warnings: FinancialWarning[];
  advice: FinancialAdvice[];
  summary: string;
}
