import type {
  CostCategory as SharedCostCategory,
  FinancialAdvice as SharedFinancialAdvice,
  FinancialCostEstimate as SharedFinancialCostEstimate,
  FinancialReadinessResult as SharedFinancialReadinessResult,
  FinancialRiskLevel as SharedFinancialRiskLevel,
  FinancialWarning as SharedFinancialWarning,
  TriggeredFinancialRule as SharedTriggeredFinancialRule,
} from '@reloplanner/shared-contracts';

export type FinancialRiskLevel = SharedFinancialRiskLevel;

export type CostEstimateSource = 'CITY' | 'COUNTRY' | 'GLOBAL';

export type CostCategory = SharedCostCategory;

export interface FinancialCostCategoryEstimate {
  category: CostCategory;
  monthlyAmountUsd: number;
}

export interface FinancialCostEstimate extends SharedFinancialCostEstimate {}

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

export interface TriggeredFinancialRule extends SharedTriggeredFinancialRule {}

export interface FinancialAdvice extends SharedFinancialAdvice {}

export interface FinancialWarning extends SharedFinancialWarning {}

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

export interface FinancialReadinessResult extends SharedFinancialReadinessResult {}
