-- Case-to-profile attachment (1 profile per case).
ALTER TABLE "relocation_cases"
ADD COLUMN "profile_id" TEXT;

CREATE UNIQUE INDEX "relocation_cases_profile_id_key"
ON "relocation_cases"("profile_id");

ALTER TABLE "relocation_cases"
ADD CONSTRAINT "relocation_cases_profile_id_fkey"
FOREIGN KEY ("profile_id") REFERENCES "relocation_profiles"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Direct internal chats for specialist <-> client communication.
CREATE TYPE "DirectChatMessageKind" AS ENUM ('USER', 'SPECIALIST', 'SYSTEM');

CREATE TABLE "direct_chat_threads" (
  "id" TEXT NOT NULL,
  "client_user_id" TEXT NOT NULL,
  "specialist_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "direct_chat_threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "direct_chat_messages" (
  "id" TEXT NOT NULL,
  "thread_id" TEXT NOT NULL,
  "author_user_id" TEXT NOT NULL,
  "kind" "DirectChatMessageKind" NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "direct_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "direct_chat_threads_client_user_id_specialist_user_id_key"
ON "direct_chat_threads"("client_user_id", "specialist_user_id");

CREATE INDEX "direct_chat_threads_specialist_user_id_updated_at_idx"
ON "direct_chat_threads"("specialist_user_id", "updated_at");

CREATE INDEX "direct_chat_threads_client_user_id_updated_at_idx"
ON "direct_chat_threads"("client_user_id", "updated_at");

CREATE INDEX "direct_chat_messages_thread_id_created_at_idx"
ON "direct_chat_messages"("thread_id", "created_at");

CREATE INDEX "direct_chat_messages_author_user_id_created_at_idx"
ON "direct_chat_messages"("author_user_id", "created_at");

ALTER TABLE "direct_chat_threads"
ADD CONSTRAINT "direct_chat_threads_client_user_id_fkey"
FOREIGN KEY ("client_user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "direct_chat_threads"
ADD CONSTRAINT "direct_chat_threads_specialist_user_id_fkey"
FOREIGN KEY ("specialist_user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "direct_chat_messages"
ADD CONSTRAINT "direct_chat_messages_thread_id_fkey"
FOREIGN KEY ("thread_id") REFERENCES "direct_chat_threads"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "direct_chat_messages"
ADD CONSTRAINT "direct_chat_messages_author_user_id_fkey"
FOREIGN KEY ("author_user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
