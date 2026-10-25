-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "gender" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "filter_countries" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "filter_genders" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "filter_languages" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "filter_regions" TEXT[] DEFAULT ARRAY[]::TEXT[];
