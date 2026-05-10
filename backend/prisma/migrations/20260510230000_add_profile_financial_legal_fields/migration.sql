CREATE TYPE "CurrencyCode" AS ENUM ('USD', 'EUR', 'GBP', 'CAD', 'PLN', 'UAH');

CREATE TYPE "LifestyleProfile" AS ENUM ('FRUGAL', 'STANDARD', 'COMFORTABLE');

ALTER TABLE "relocation_profiles"
  ADD COLUMN "savings_amount" DECIMAL(12,2),
  ADD COLUMN "savings_currency" "CurrencyCode",
  ADD COLUMN "monthly_budget_amount" DECIMAL(12,2),
  ADD COLUMN "monthly_budget_currency" "CurrencyCode",
  ADD COLUMN "expected_net_salary_amount" DECIMAL(12,2),
  ADD COLUMN "expected_net_salary_currency" "CurrencyCode",
  ADD COLUMN "dependents_count" SMALLINT,
  ADD COLUMN "lifestyle" "LifestyleProfile",
  ADD COLUMN "job_search_months" SMALLINT,
  ADD COLUMN "has_existing_work_authorization" BOOLEAN,
  ADD COLUMN "has_job_offer" BOOLEAN,
  ADD COLUMN "has_recognized_degree" BOOLEAN,
  ADD COLUMN "has_formal_education" BOOLEAN,
  ADD COLUMN "relocation_with_family" BOOLEAN;
