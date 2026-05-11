import type {
  FinancialReadinessFacts,
  FinancialReadinessRule,
} from './financial-readiness.types.js';

export function buildFinancialRuleRegistry(): FinancialReadinessRule[] {
  return [
    {
      code: 'NO_SAVINGS_HIGH_RISK',
      description:
        'Missing savings creates immediate relocation runway risk.',
      when: (facts) => !facts.savingsUsd || facts.savingsUsd <= 0,
      then: () => ({
        riskLevel: 'HIGH',
        warnings: [
          {
            code: 'NO_SAVINGS_WARNING',
            severity: 'HIGH',
            message:
              'No relocation savings were provided. Financial runway is likely insufficient.',
          },
        ],
        advice: [
          {
            code: 'BUILD_MINIMUM_RUNWAY',
            message:
              'Build a minimum savings runway before committing to relocation timing.',
          },
        ],
      }),
    },
    {
      code: 'RUNWAY_BELOW_THREE_MONTHS',
      description: 'Less than 3 months runway is a high financial risk signal.',
      when: (facts) => facts.runwayMonths !== null && facts.runwayMonths < 3,
      then: (facts) => ({
        riskLevel: 'HIGH',
        warnings: [
          {
            code: 'RUNWAY_CRITICAL_WARNING',
            severity: 'HIGH',
            message: `Estimated runway is ${facts.runwayMonths?.toFixed(1)} months, which is below a safer threshold.`,
          },
        ],
      }),
    },
    {
      code: 'RUNWAY_THREE_TO_SIX_MONTHS',
      description: 'A 3-6 month runway is moderate risk and should be improved.',
      when: (facts) =>
        facts.runwayMonths !== null &&
        facts.runwayMonths >= 3 &&
        facts.runwayMonths < 6,
      then: (facts) => ({
        riskLevel: 'MODERATE',
        warnings: [
          {
            code: 'RUNWAY_MODERATE_WARNING',
            severity: 'MEDIUM',
            message: `Estimated runway is ${facts.runwayMonths?.toFixed(1)} months; additional buffer is recommended.`,
          },
        ],
      }),
    },
    {
      code: 'SALARY_COVERS_MONTHLY_NEED',
      description: 'Expected net salary covering monthly needs lowers risk.',
      when: (facts) =>
        facts.expectedNetSalaryUsd !== null &&
        facts.expectedNetSalaryUsd >= facts.effectiveMonthlyNeedUsd,
      then: () => ({
        riskShift: -1,
        advice: [
          {
            code: 'VERIFY_SALARY_NET_ASSUMPTIONS',
            message:
              'Expected net salary appears to cover estimated monthly needs. Validate net-pay assumptions and contract details.',
          },
        ],
      }),
    },
    {
      code: 'MISSING_EXPECTED_SALARY',
      description: 'Missing expected salary keeps income side uncertain.',
      when: (facts) => facts.expectedNetSalaryUsd === null,
      then: () => ({
        riskShift: 1,
        warnings: [
          {
            code: 'MISSING_EXPECTED_SALARY_WARNING',
            severity: 'MEDIUM',
            message:
              'Expected net salary is not provided, so post-relocation affordability is uncertain.',
          },
        ],
      }),
    },
    {
      code: 'DEPENDENTS_INCREASE_COMPLEXITY',
      description: 'Dependents typically raise monthly financial pressure.',
      when: (facts) => facts.dependentsCount > 0,
      then: (facts) => ({
        riskShift: 1,
        warnings: [
          {
            code: 'DEPENDENTS_COST_PRESSURE',
            severity: 'MEDIUM',
            message: `Dependents count (${facts.dependentsCount}) increases cost pressure and requires stronger financial buffer.`,
          },
        ],
      }),
    },
  ];
}
