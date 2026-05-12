-- Add SPECIALIST role for internal employees.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SPECIALIST';

CREATE TYPE "RelocationCaseStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'IN_PROGRESS',
  'NEEDS_USER_INPUT',
  'ARCHIVED',
  'CANCELED',
  'COMPLETED'
);

CREATE TYPE "CaseActivityType" AS ENUM (
  'CASE_CREATED',
  'CASE_SUBMITTED',
  'CASE_ARCHIVED',
  'CASE_CANCELED',
  'CASE_STATUS_CHANGED',
  'SPECIALIST_ASSIGNED',
  'SPECIALIST_REASSIGNED',
  'MESSAGE_POSTED',
  'MESSAGE_READ'
);

CREATE TYPE "CaseMessageKind" AS ENUM ('USER', 'SPECIALIST', 'SYSTEM');

CREATE TYPE "NotificationType" AS ENUM (
  'CASE_ASSIGNED',
  'CASE_REASSIGNED',
  'CASE_STATUS_CHANGED',
  'CASE_MESSAGE',
  'CASE_SYSTEM'
);

CREATE TABLE "relocation_cases" (
  "id" TEXT NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "specialist_user_id" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "RelocationCaseStatus" NOT NULL DEFAULT 'DRAFT',
  "submitted_at" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
  "canceled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "relocation_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "case_activities" (
  "id" TEXT NOT NULL,
  "case_id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "type" "CaseActivityType" NOT NULL,
  "status_from" "RelocationCaseStatus",
  "status_to" "RelocationCaseStatus",
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "case_activities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "case_messages" (
  "id" TEXT NOT NULL,
  "case_id" TEXT NOT NULL,
  "author_user_id" TEXT,
  "kind" "CaseMessageKind" NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "case_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "case_read_states" (
  "id" TEXT NOT NULL,
  "case_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "last_read_message_id" TEXT,
  "last_read_at" TIMESTAMP(3),
  "unread_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "case_read_states_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "case_id" TEXT,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "is_read" BOOLEAN NOT NULL DEFAULT false,
  "read_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "case_read_states_case_id_user_id_key"
ON "case_read_states"("case_id", "user_id");

CREATE INDEX "relocation_cases_owner_user_id_status_updated_at_idx"
ON "relocation_cases"("owner_user_id", "status", "updated_at");

CREATE INDEX "relocation_cases_specialist_user_id_status_updated_at_idx"
ON "relocation_cases"("specialist_user_id", "status", "updated_at");

CREATE INDEX "case_activities_case_id_created_at_idx"
ON "case_activities"("case_id", "created_at");

CREATE INDEX "case_messages_case_id_created_at_idx"
ON "case_messages"("case_id", "created_at");

CREATE INDEX "case_read_states_user_id_unread_count_updated_at_idx"
ON "case_read_states"("user_id", "unread_count", "updated_at");

CREATE INDEX "notifications_user_id_is_read_created_at_idx"
ON "notifications"("user_id", "is_read", "created_at");

CREATE INDEX "notifications_case_id_created_at_idx"
ON "notifications"("case_id", "created_at");

ALTER TABLE "relocation_cases"
ADD CONSTRAINT "relocation_cases_owner_user_id_fkey"
FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "relocation_cases"
ADD CONSTRAINT "relocation_cases_specialist_user_id_fkey"
FOREIGN KEY ("specialist_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "case_activities"
ADD CONSTRAINT "case_activities_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "relocation_cases"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_activities"
ADD CONSTRAINT "case_activities_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "case_messages"
ADD CONSTRAINT "case_messages_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "relocation_cases"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_messages"
ADD CONSTRAINT "case_messages_author_user_id_fkey"
FOREIGN KEY ("author_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "case_read_states"
ADD CONSTRAINT "case_read_states_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "relocation_cases"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_read_states"
ADD CONSTRAINT "case_read_states_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "case_read_states"
ADD CONSTRAINT "case_read_states_last_read_message_id_fkey"
FOREIGN KEY ("last_read_message_id") REFERENCES "case_messages"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "relocation_cases"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
