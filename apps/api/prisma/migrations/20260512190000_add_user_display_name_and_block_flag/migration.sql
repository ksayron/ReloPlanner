ALTER TABLE "users"
ADD COLUMN "display_name" TEXT,
ADD COLUMN "is_blocked" BOOLEAN NOT NULL DEFAULT false;
