-- AlterTable (legacy direct chat table may not exist in fresh shadow DB runs)
ALTER TABLE IF EXISTS "direct_chat_threads" ALTER COLUMN "updated_at" DROP DEFAULT;
