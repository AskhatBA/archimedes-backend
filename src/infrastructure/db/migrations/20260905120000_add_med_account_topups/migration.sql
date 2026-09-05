-- CreateEnum
CREATE TYPE "MedAccountTopupStatus" AS ENUM ('PENDING', 'CREDITED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEvent" ADD VALUE 'MED_ACCOUNT_TOPUP_OPTION_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'MED_ACCOUNT_TOPUP_OPTION_UPDATED';
ALTER TYPE "AuditEvent" ADD VALUE 'MED_ACCOUNT_TOPUP_OPTION_DELETED';
ALTER TYPE "AuditEvent" ADD VALUE 'MED_ACCOUNT_TOPUP_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'MED_ACCOUNT_TOPUP_CREDITED';
ALTER TYPE "AuditEvent" ADD VALUE 'MED_ACCOUNT_TOPUP_STATUS_CHANGED';

-- AlterEnum
ALTER TYPE "PaymentPurpose" ADD VALUE 'MED_ACCOUNT_TOPUP';

-- CreateTable
CREATE TABLE "MedAccountTopupOption" (
    "id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "label" TEXT,
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedAccountTopupOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedAccountTopup" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "optionId" UUID,
    "amount" INTEGER NOT NULL,
    "status" "MedAccountTopupStatus" NOT NULL DEFAULT 'PENDING',
    "beneficiaryId" TEXT,
    "externalRef" TEXT,
    "comment" TEXT,
    "creditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedAccountTopup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MedAccountTopupOption_amount_key" ON "MedAccountTopupOption"("amount");

-- CreateIndex
CREATE INDEX "MedAccountTopupOption_isActive_sortOrder_idx" ON "MedAccountTopupOption"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MedAccountTopup_paymentId_key" ON "MedAccountTopup"("paymentId");

-- CreateIndex
CREATE INDEX "MedAccountTopup_userId_idx" ON "MedAccountTopup"("userId");

-- CreateIndex
CREATE INDEX "MedAccountTopup_status_createdAt_idx" ON "MedAccountTopup"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MedAccountTopup_createdAt_idx" ON "MedAccountTopup"("createdAt");

-- AddForeignKey
ALTER TABLE "MedAccountTopup" ADD CONSTRAINT "MedAccountTopup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedAccountTopup" ADD CONSTRAINT "MedAccountTopup_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedAccountTopup" ADD CONSTRAINT "MedAccountTopup_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "MedAccountTopupOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

