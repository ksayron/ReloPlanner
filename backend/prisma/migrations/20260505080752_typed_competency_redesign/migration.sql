-- CreateEnum
CREATE TYPE "CompetencyType" AS ENUM ('HARD_SKILL', 'LANGUAGE', 'CERTIFICATION', 'DOMAIN_KNOWLEDGE', 'SOFT_SKILL');

-- CreateEnum
CREATE TYPE "HardSkillLevel" AS ENUM ('NONE', 'BASIC', 'PRACTICAL', 'CONFIDENT', 'ADVANCED');

-- CreateEnum
CREATE TYPE "LanguageLevel" AS ENUM ('NONE', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2');

-- CreateEnum
CREATE TYPE "CertificationStatus" AS ENUM ('NONE', 'PLANNED', 'IN_PROGRESS', 'OBTAINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CertificationRequirementLevel" AS ENUM ('OPTIONAL', 'PREFERRED', 'REQUIRED');

-- CreateEnum
CREATE TYPE "RequirementPriority" AS ENUM ('CORE', 'IMPORTANT', 'OPTIONAL', 'CONTEXTUAL');

-- CreateEnum
CREATE TYPE "RoleRelevance" AS ENUM ('CORE', 'RELATED', 'WEAKLY_RELATED', 'IRRELEVANT');

-- CreateEnum
CREATE TYPE "RecommendationType" AS ENUM ('ACTIONABLE_GAP', 'OPTIONAL_IMPROVEMENT', 'MARKET_CONTEXT', 'EXCLUDED_AS_IRRELEVANT');

-- CreateEnum
CREATE TYPE "LanguageRequirementContext" AS ENUM ('JOB_MARKET', 'RELOCATION_ADAPTATION', 'LEGAL_OR_ADMIN', 'OPTIONAL_ADVANTAGE');

-- CreateEnum
CREATE TYPE "CountryLanguageRelevance" AS ENUM ('PRIMARY', 'BUSINESS_COMMON', 'MINORITY', 'IRRELEVANT');

-- AlterTable
ALTER TABLE "analysis_results" ADD COLUMN     "time_estimate" JSONB;

-- CreateTable
CREATE TABLE "competencies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CompetencyType" NOT NULL,
    "family" TEXT,
    "parent_id" TEXT,
    "legacy_skill_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_competencies" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "competency_id" TEXT NOT NULL,
    "hard_skill_level" "HardSkillLevel",
    "language_level" "LanguageLevel",
    "certification_status" "CertificationStatus",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_competencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_requirements" (
    "id" TEXT NOT NULL,
    "snapshot_id" TEXT,
    "country_code" TEXT NOT NULL,
    "role_name" TEXT NOT NULL,
    "competency_id" TEXT NOT NULL,
    "competency_type" "CompetencyType" NOT NULL,
    "hard_skill_required_level" "HardSkillLevel",
    "language_required_level" "LanguageLevel",
    "certification_requirement_level" "CertificationRequirementLevel",
    "required_certification_status" "CertificationStatus",
    "priority" "RequirementPriority" NOT NULL,
    "role_relevance" "RoleRelevance" NOT NULL,
    "language_context" "LanguageRequirementContext",
    "frequency" DECIMAL(5,4) NOT NULL,
    "importance" DECIMAL(5,4) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "country_languages" (
    "id" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "language_competency_id" TEXT NOT NULL,
    "relevance" "CountryLanguageRelevance" NOT NULL,

    CONSTRAINT "country_languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_competency_rules" (
    "id" TEXT NOT NULL,
    "role_name" TEXT NOT NULL,
    "competency_family" TEXT NOT NULL,
    "default_relevance" "RoleRelevance" NOT NULL,
    "default_priority" "RequirementPriority" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_competency_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_effort_profiles" (
    "id" TEXT NOT NULL,
    "competency_id" TEXT NOT NULL,
    "target_level" TEXT NOT NULL,
    "estimated_hours" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_effort_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_items" (
    "id" TEXT NOT NULL,
    "analysis_id" TEXT NOT NULL,
    "competency_id" TEXT NOT NULL,
    "current_display_level" TEXT NOT NULL,
    "required_display_level" TEXT NOT NULL,
    "normalized_current_score" DECIMAL(4,3) NOT NULL,
    "normalized_required_score" DECIMAL(4,3) NOT NULL,
    "match_score" DECIMAL(4,3) NOT NULL,
    "priority" "RequirementPriority" NOT NULL,
    "role_relevance" "RoleRelevance" NOT NULL,
    "recommendation_type" "RecommendationType" NOT NULL,
    "included_in_roadmap" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "weight" DECIMAL(6,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_steps" (
    "id" TEXT NOT NULL,
    "analysis_id" TEXT NOT NULL,
    "competency_id" TEXT NOT NULL,
    "order_index" SMALLINT NOT NULL,
    "estimated_hours" INTEGER NOT NULL,
    "estimated_months" DECIMAL(4,1) NOT NULL,
    "depends_on" TEXT[],
    "priority" "RequirementPriority" NOT NULL,
    "role_relevance" "RoleRelevance" NOT NULL,
    "recommendation_type" "RecommendationType" NOT NULL,
    "current_display_level" TEXT NOT NULL,
    "required_display_level" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "GapStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roadmap_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "competencies_name_key" ON "competencies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "competencies_legacy_skill_id_key" ON "competencies"("legacy_skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_competencies_profile_id_competency_id_key" ON "user_competencies"("profile_id", "competency_id");

-- CreateIndex
CREATE INDEX "market_requirements_country_code_role_name_is_active_idx" ON "market_requirements"("country_code", "role_name", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "market_requirements_country_code_role_name_competency_id_key" ON "market_requirements"("country_code", "role_name", "competency_id");

-- CreateIndex
CREATE UNIQUE INDEX "country_languages_country_code_language_competency_id_key" ON "country_languages"("country_code", "language_competency_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_competency_rules_role_name_competency_family_key" ON "role_competency_rules"("role_name", "competency_family");

-- CreateIndex
CREATE UNIQUE INDEX "learning_effort_profiles_competency_id_target_level_key" ON "learning_effort_profiles"("competency_id", "target_level");

-- CreateIndex
CREATE INDEX "analysis_items_analysis_id_recommendation_type_idx" ON "analysis_items"("analysis_id", "recommendation_type");

-- CreateIndex
CREATE INDEX "roadmap_steps_analysis_id_order_index_idx" ON "roadmap_steps"("analysis_id", "order_index");

-- AddForeignKey
ALTER TABLE "competencies" ADD CONSTRAINT "competencies_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "competencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_competencies" ADD CONSTRAINT "user_competencies_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "relocation_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_competencies" ADD CONSTRAINT "user_competencies_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "competencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_requirements" ADD CONSTRAINT "market_requirements_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "market_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_requirements" ADD CONSTRAINT "market_requirements_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "competencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "country_languages" ADD CONSTRAINT "country_languages_language_competency_id_fkey" FOREIGN KEY ("language_competency_id") REFERENCES "competencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_effort_profiles" ADD CONSTRAINT "learning_effort_profiles_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "competencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_items" ADD CONSTRAINT "analysis_items_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analysis_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_items" ADD CONSTRAINT "analysis_items_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "competencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_steps" ADD CONSTRAINT "roadmap_steps_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analysis_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_steps" ADD CONSTRAINT "roadmap_steps_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "competencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
