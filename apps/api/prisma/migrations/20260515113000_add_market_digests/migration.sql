CREATE TABLE "market_digests" (
    "country_code" TEXT NOT NULL,
    "snapshot_date" DATE,
    "snapshot_source" TEXT,
    "total_vacancies" INTEGER,
    "roles" JSONB NOT NULL,
    "top_skills" JSONB NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "market_digests_pkey" PRIMARY KEY ("country_code")
);
