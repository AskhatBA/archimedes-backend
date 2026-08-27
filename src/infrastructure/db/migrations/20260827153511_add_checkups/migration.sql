-- CreateEnum
CREATE TYPE "CheckupCoverage" AS ENUM ('PERSONAL', 'FAMILY');

-- CreateTable
CREATE TABLE "Checkup" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "duration" TEXT,
    "coverage" "CheckupCoverage" NOT NULL DEFAULT 'PERSONAL',
    "services" TEXT[],
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Checkup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Checkup_code_key" ON "Checkup"("code");

-- CreateIndex
CREATE INDEX "Checkup_isActive_sortOrder_idx" ON "Checkup"("isActive", "sortOrder");
