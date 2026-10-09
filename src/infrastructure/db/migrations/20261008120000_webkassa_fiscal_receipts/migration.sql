-- CreateEnum
CREATE TYPE "FiscalOperationType" AS ENUM ('SALE', 'SALE_RETURN');

-- CreateEnum
CREATE TYPE "FiscalReceiptStatus" AS ENUM ('PENDING', 'ISSUED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEvent" ADD VALUE 'FISCAL_RECEIPT_ISSUED';
ALTER TYPE "AuditEvent" ADD VALUE 'FISCAL_RECEIPT_FAILED';
ALTER TYPE "AuditEvent" ADD VALUE 'FISCAL_RECEIPT_RETRIED';
ALTER TYPE "AuditEvent" ADD VALUE 'FISCAL_SHIFT_CLOSED';

-- CreateTable
CREATE TABLE "FiscalReceipt" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "refundId" UUID,
    "userId" UUID NOT NULL,
    "operationType" "FiscalOperationType" NOT NULL,
    "status" "FiscalReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "externalCheckNumber" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "cashboxUniqueNumber" TEXT NOT NULL,
    "positions" JSONB,
    "checkNumber" TEXT,
    "registrationNumber" TEXT,
    "checkOrderNumber" INTEGER,
    "shiftNumber" INTEGER,
    "offlineMode" BOOLEAN,
    "fiscalizedAt" TIMESTAMP(3),
    "ticketUrl" TEXT,
    "ticketPrintUrl" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "retryRound" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" INTEGER,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FiscalReceipt_refundId_key" ON "FiscalReceipt"("refundId");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalReceipt_externalCheckNumber_key" ON "FiscalReceipt"("externalCheckNumber");

-- CreateIndex
CREATE INDEX "FiscalReceipt_paymentId_idx" ON "FiscalReceipt"("paymentId");

-- CreateIndex
CREATE INDEX "FiscalReceipt_status_createdAt_idx" ON "FiscalReceipt"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FiscalReceipt_userId_idx" ON "FiscalReceipt"("userId");

-- CreateIndex
CREATE INDEX "FiscalReceipt_createdAt_idx" ON "FiscalReceipt"("createdAt");

-- AddForeignKey
ALTER TABLE "FiscalReceipt" ADD CONSTRAINT "FiscalReceipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalReceipt" ADD CONSTRAINT "FiscalReceipt_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "AppointmentRefund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalReceipt" ADD CONSTRAINT "FiscalReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

