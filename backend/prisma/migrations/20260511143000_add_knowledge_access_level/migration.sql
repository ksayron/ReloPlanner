-- CreateEnum
CREATE TYPE "KnowledgeAccessLevel" AS ENUM ('FREE', 'PREMIUM');

-- AlterTable
ALTER TABLE "knowledge_articles"
ADD COLUMN "access_level" "KnowledgeAccessLevel" NOT NULL DEFAULT 'FREE';

