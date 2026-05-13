-- CreateEnum
CREATE TYPE "KnowledgeCategory" AS ENUM ('VISA', 'LEGAL', 'COST', 'JOB', 'CV', 'LANGUAGE', 'HOUSING');

-- CreateTable
CREATE TABLE "knowledge_articles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "category" "KnowledgeCategory" NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "content" TEXT NOT NULL,
    "topicTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "riskTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_articles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_articles_country_category_language_idx" ON "knowledge_articles"("country", "category", "language");

-- CreateIndex
CREATE INDEX "knowledge_articles_updated_at_idx" ON "knowledge_articles"("updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_articles_slug_language_key" ON "knowledge_articles"("slug", "language");
