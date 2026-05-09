CREATE TABLE IF NOT EXISTS "analysis_ai_summaries" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "analysis_id" TEXT NOT NULL UNIQUE,
  "summary_json" JSONB NOT NULL,
  "meta_json" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "analysis_ai_summaries_analysis_id_fkey"
    FOREIGN KEY ("analysis_id") REFERENCES "analysis_results"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE OR REPLACE FUNCTION set_analysis_ai_summaries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_analysis_ai_summaries_updated_at ON "analysis_ai_summaries";
CREATE TRIGGER trg_analysis_ai_summaries_updated_at
BEFORE UPDATE ON "analysis_ai_summaries"
FOR EACH ROW
EXECUTE FUNCTION set_analysis_ai_summaries_updated_at();
