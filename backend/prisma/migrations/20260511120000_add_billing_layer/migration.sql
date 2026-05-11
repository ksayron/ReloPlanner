-- CreateEnum
CREATE TYPE "PlanCode" AS ENUM ('FREE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "code" "PlanCode" NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL,
    "billing_period" "BillingPeriod" NOT NULL DEFAULT 'MONTHLY',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_entitlements" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "feature_code" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "limit_value" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "provider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE',
    "provider_subscription_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE',
    "provider_payment_id" TEXT,
    "provider_checkout_session_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "failure_code" TEXT,
    "failure_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "feature_entitlements_plan_id_feature_code_key" ON "feature_entitlements"("plan_id", "feature_code");

-- CreateIndex
CREATE INDEX "feature_entitlements_feature_code_idx" ON "feature_entitlements"("feature_code");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_status_expires_at_idx" ON "subscriptions"("user_id", "status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_checkout_session_id_key" ON "payments"("provider_checkout_session_id");

-- CreateIndex
CREATE INDEX "payments_user_id_created_at_idx" ON "payments"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

-- AddForeignKey
ALTER TABLE "feature_entitlements" ADD CONSTRAINT "feature_entitlements_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed core plans for migration-time defaults.
INSERT INTO "plans" ("id", "code", "name", "price", "currency", "billing_period", "is_active", "created_at", "updated_at")
VALUES
  ('plan_free_default', 'FREE', 'Free', 0, 'USD', 'MONTHLY', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plan_premium_default', 'PREMIUM', 'Premium', 19.99, 'USD', 'MONTHLY', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Ensure pre-existing users default to an active FREE subscription.
INSERT INTO "subscriptions" (
  "id",
  "user_id",
  "plan_id",
  "status",
  "started_at",
  "provider",
  "created_at",
  "updated_at"
)
SELECT
  concat('sub_free_', md5(u.id || clock_timestamp()::text)),
  u.id,
  p.id,
  'ACTIVE',
  CURRENT_TIMESTAMP,
  'STRIPE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users" u
JOIN "plans" p ON p.code = 'FREE'
WHERE NOT EXISTS (
  SELECT 1
  FROM "subscriptions" s
  WHERE s.user_id = u.id
    AND s.status = 'ACTIVE'
    AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
);

