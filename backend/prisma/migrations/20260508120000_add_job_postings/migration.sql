CREATE TABLE "job_postings" (
    "id" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "role_name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_url" TEXT,
    "source_external_id" TEXT,
    "salary_min_usd" INTEGER,
    "salary_max_usd" INTEGER,
    "salary_currency" TEXT,
    "requirements" JSONB NOT NULL,
    "requirement_competency_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dedup_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "job_postings_dedup_key_key" ON "job_postings"("dedup_key");
CREATE INDEX "job_postings_country_code_role_name_created_at_idx" ON "job_postings"("country_code", "role_name", "created_at");
