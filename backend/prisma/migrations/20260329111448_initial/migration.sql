-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'PREMIUM', 'ADMIN');

-- CreateEnum
CREATE TYPE "SkillCategory" AS ENUM ('HARD_SKILL', 'LANGUAGE', 'CERTIFICATION', 'SOFT_SKILL');

-- CreateEnum
CREATE TYPE "GapType" AS ENUM ('HARD_SKILL', 'LANGUAGE', 'CERTIFICATION', 'EXPERIENCE');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'MODERATE', 'MINOR');

-- CreateEnum
CREATE TYPE "GapStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('RENT', 'FOOD', 'TRANSPORT', 'UTILITIES', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relocation_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "target_country" TEXT NOT NULL,
    "target_city" TEXT,
    "current_country" TEXT NOT NULL,
    "years_experience" SMALLINT NOT NULL,
    "desired_role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relocation_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "SkillCategory" NOT NULL,
    "parent_id" TEXT,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_aliases" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,

    CONSTRAINT "skill_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_transferability" (
    "source_skill_id" TEXT NOT NULL,
    "target_skill_id" TEXT NOT NULL,
    "coefficient" DECIMAL(3,2) NOT NULL,

    CONSTRAINT "skill_transferability_pkey" PRIMARY KEY ("source_skill_id","target_skill_id")
);

-- CreateTable
CREATE TABLE "user_skills" (
    "profile_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "proficiency" DECIMAL(3,2) NOT NULL,

    CONSTRAINT "user_skills_pkey" PRIMARY KEY ("profile_id","skill_id")
);

-- CreateTable
CREATE TABLE "market_snapshots" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT,
    "snapshot_date" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "total_vacancies" INTEGER NOT NULL,

    CONSTRAINT "market_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_skill_demands" (
    "snapshot_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "frequency" DECIMAL(5,4) NOT NULL,
    "avg_required_level" DECIMAL(3,2) NOT NULL,

    CONSTRAINT "market_skill_demands_pkey" PRIMARY KEY ("snapshot_id","skill_id")
);

-- CreateTable
CREATE TABLE "cost_of_living_data" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "category" "CostCategory" NOT NULL,
    "avg_monthly_usd" DECIMAL(10,2) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_of_living_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_results" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "fit_score" DECIMAL(4,3) NOT NULL,
    "skill_breakdown" JSONB NOT NULL,
    "total_prep_months" DECIMAL(4,1) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gap_items" (
    "id" TEXT NOT NULL,
    "analysis_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "gap_type" "GapType" NOT NULL,
    "severity" "Severity" NOT NULL,
    "current_level" DECIMAL(3,2) NOT NULL,
    "required_level" DECIMAL(3,2) NOT NULL,
    "estimated_months" DECIMAL(3,1) NOT NULL,
    "depends_on" TEXT[],
    "order_index" SMALLINT NOT NULL,
    "status" "GapStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "gap_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "skills_name_key" ON "skills"("name");

-- CreateIndex
CREATE UNIQUE INDEX "skill_aliases_alias_key" ON "skill_aliases"("alias");

-- AddForeignKey
ALTER TABLE "relocation_profiles" ADD CONSTRAINT "relocation_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_aliases" ADD CONSTRAINT "skill_aliases_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_transferability" ADD CONSTRAINT "skill_transferability_source_skill_id_fkey" FOREIGN KEY ("source_skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_transferability" ADD CONSTRAINT "skill_transferability_target_skill_id_fkey" FOREIGN KEY ("target_skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "relocation_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_skill_demands" ADD CONSTRAINT "market_skill_demands_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "market_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_skill_demands" ADD CONSTRAINT "market_skill_demands_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "relocation_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "market_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gap_items" ADD CONSTRAINT "gap_items_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analysis_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gap_items" ADD CONSTRAINT "gap_items_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
