-- AlterTable
ALTER TABLE "analysis_ai_summaries" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "case_read_states" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "relocation_cases" ALTER COLUMN "updated_at" DROP DEFAULT;
