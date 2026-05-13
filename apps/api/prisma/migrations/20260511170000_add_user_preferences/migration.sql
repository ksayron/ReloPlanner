-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "preferred_language" TEXT NOT NULL DEFAULT 'en',
    "preferred_theme" TEXT NOT NULL DEFAULT 'light',
    "preferred_currency" "CurrencyCode" NOT NULL DEFAULT 'USD',
    "default_target_country" TEXT,
    "default_target_city" TEXT,
    "weekly_study_hours" SMALLINT NOT NULL DEFAULT 8,
    "preferred_report_language" TEXT NOT NULL DEFAULT 'en',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");

-- AddForeignKey
ALTER TABLE "user_preferences"
ADD CONSTRAINT "user_preferences_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill defaults for existing users
INSERT INTO "user_preferences" (
    "id",
    "user_id",
    "preferred_language",
    "preferred_theme",
    "preferred_currency",
    "default_target_country",
    "default_target_city",
    "weekly_study_hours",
    "preferred_report_language",
    "created_at",
    "updated_at"
)
SELECT
    md5(random()::text || clock_timestamp()::text || u."id"),
    u."id",
    'en',
    'light',
    'USD',
    NULL,
    NULL,
    8,
    'en',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "users" u
LEFT JOIN "user_preferences" up ON up."user_id" = u."id"
WHERE up."id" IS NULL;
