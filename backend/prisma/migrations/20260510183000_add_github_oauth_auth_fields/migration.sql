ALTER TABLE "users"
ALTER COLUMN "password_hash" DROP NOT NULL;

ALTER TABLE "users"
ADD COLUMN "github_id" TEXT,
ADD COLUMN "github_login" TEXT;

CREATE UNIQUE INDEX "users_github_id_key" ON "users"("github_id");
