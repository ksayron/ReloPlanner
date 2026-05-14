-- Create new per-user case visibility/state table.
CREATE TABLE "case_user_states" (
  "id" TEXT NOT NULL,
  "case_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "is_archived" BOOLEAN NOT NULL DEFAULT false,
  "archived_at" TIMESTAMP(3),
  "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  "deleted_at" TIMESTAMP(3),
  "last_opened_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "case_user_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "case_user_states_case_id_user_id_key"
ON "case_user_states"("case_id", "user_id");

CREATE INDEX "case_user_states_user_id_is_archived_updated_at_idx"
ON "case_user_states"("user_id", "is_archived", "updated_at");

CREATE INDEX "case_user_states_user_id_is_deleted_updated_at_idx"
ON "case_user_states"("user_id", "is_deleted", "updated_at");

ALTER TABLE "case_user_states"
ADD CONSTRAINT "case_user_states_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "relocation_cases"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_user_states"
ADD CONSTRAINT "case_user_states_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Create specialist-only note storage (one note per specialist per case).
CREATE TABLE "specialist_case_notes" (
  "id" TEXT NOT NULL,
  "case_id" TEXT NOT NULL,
  "specialist_user_id" TEXT NOT NULL,
  "body" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "specialist_case_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "specialist_case_notes_case_id_specialist_user_id_key"
ON "specialist_case_notes"("case_id", "specialist_user_id");

CREATE INDEX "specialist_case_notes_specialist_user_id_updated_at_idx"
ON "specialist_case_notes"("specialist_user_id", "updated_at");

ALTER TABLE "specialist_case_notes"
ADD CONSTRAINT "specialist_case_notes_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "relocation_cases"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "specialist_case_notes"
ADD CONSTRAINT "specialist_case_notes_specialist_user_id_fkey"
FOREIGN KEY ("specialist_user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill per-user rows for all case participants.
INSERT INTO "case_user_states" (
  "id",
  "case_id",
  "user_id",
  "is_archived",
  "archived_at",
  "is_deleted",
  "created_at",
  "updated_at"
)
SELECT
  md5(random()::text || clock_timestamp()::text || "id" || "owner_user_id"),
  "id",
  "owner_user_id",
  false,
  NULL,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "relocation_cases"
ON CONFLICT ("case_id", "user_id") DO NOTHING;

INSERT INTO "case_user_states" (
  "id",
  "case_id",
  "user_id",
  "is_archived",
  "archived_at",
  "is_deleted",
  "created_at",
  "updated_at"
)
SELECT
  md5(random()::text || clock_timestamp()::text || "id" || "specialist_user_id"),
  "id",
  "specialist_user_id",
  false,
  NULL,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "relocation_cases"
WHERE "specialist_user_id" IS NOT NULL
ON CONFLICT ("case_id", "user_id") DO NOTHING;

-- Preserve legacy archived intent as per-user archive visibility.
UPDATE "case_user_states" cus
SET "is_archived" = true,
    "archived_at" = COALESCE(cus."archived_at", rc."archived_at", CURRENT_TIMESTAMP),
    "updated_at" = CURRENT_TIMESTAMP
FROM "relocation_cases" rc
WHERE rc."id" = cus."case_id"
  AND rc."status" = 'ARCHIVED';

-- Convert legacy global archived status into supported workflow status.
UPDATE "relocation_cases"
SET "status" = 'COMPLETED',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'ARCHIVED';

UPDATE "case_activities"
SET "status_from" = 'COMPLETED'
WHERE "status_from" = 'ARCHIVED';

UPDATE "case_activities"
SET "status_to" = 'COMPLETED'
WHERE "status_to" = 'ARCHIVED';

-- Remove ARCHIVED from status enum by replacing the enum type.
ALTER TYPE "RelocationCaseStatus" RENAME TO "RelocationCaseStatus_old";
CREATE TYPE "RelocationCaseStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'IN_PROGRESS',
  'NEEDS_USER_INPUT',
  'CANCELED',
  'COMPLETED'
);

ALTER TABLE "relocation_cases"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "relocation_cases"
  ALTER COLUMN "status" TYPE "RelocationCaseStatus"
  USING ("status"::text::"RelocationCaseStatus");

ALTER TABLE "case_activities"
  ALTER COLUMN "status_from" TYPE "RelocationCaseStatus"
  USING ("status_from"::text::"RelocationCaseStatus");

ALTER TABLE "case_activities"
  ALTER COLUMN "status_to" TYPE "RelocationCaseStatus"
  USING ("status_to"::text::"RelocationCaseStatus");

ALTER TABLE "relocation_cases"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DROP TYPE "RelocationCaseStatus_old";

-- Drop direct-chat storage.
DROP TABLE IF EXISTS "direct_chat_messages";
DROP TABLE IF EXISTS "direct_chat_threads";
DROP TYPE IF EXISTS "DirectChatMessageKind";
