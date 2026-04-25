-- CreateEnum
CREATE TYPE "AppVersionPlatform" AS ENUM ('IOS', 'ANDROID', 'ALL');

-- CreateTable
CREATE TABLE "AppVersion" (
    "id" UUID NOT NULL,
    "platform" "AppVersionPlatform" NOT NULL,
    "latestVersion" TEXT NOT NULL,
    "minSupportedVersion" TEXT NOT NULL,
    "forceUpdate" BOOLEAN NOT NULL DEFAULT false,
    "changelog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppVersion_platform_createdAt_idx" ON "AppVersion"("platform", "createdAt");
