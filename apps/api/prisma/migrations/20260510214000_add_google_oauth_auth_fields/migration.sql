ALTER TABLE "users"
  ADD COLUMN "google_id" TEXT,
  ADD COLUMN "google_email" TEXT;

CREATE UNIQUE INDEX "users_google_id_key"
  ON "users"("google_id");
