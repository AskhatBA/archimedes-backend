-- CreateEnum
CREATE TYPE "ProgramOrderStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProgramOrderCategory" AS ENUM ('MED_PLAN', 'CHECKUP');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEvent" ADD VALUE 'PROGRAM_ORDER_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'PROGRAM_ORDER_STATUS_CHANGED';

-- AlterEnum
ALTER TYPE "PaymentPurpose" ADD VALUE 'PAID_PROGRAM';

-- CreateTable
CREATE TABLE "ProgramOrder" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "status" "ProgramOrderStatus" NOT NULL DEFAULT 'NEW',
    "total" DOUBLE PRECISION NOT NULL,
    "contactPhone" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramOrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "category" "ProgramOrderCategory" NOT NULL,
    "externalId" TEXT NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ProgramOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgramOrder_paymentId_key" ON "ProgramOrder"("paymentId");

-- CreateIndex
CREATE INDEX "ProgramOrder_userId_idx" ON "ProgramOrder"("userId");

-- CreateIndex
CREATE INDEX "ProgramOrder_status_createdAt_idx" ON "ProgramOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProgramOrder_createdAt_idx" ON "ProgramOrder"("createdAt");

-- CreateIndex
CREATE INDEX "ProgramOrderItem_orderId_idx" ON "ProgramOrderItem"("orderId");

-- AddForeignKey
ALTER TABLE "ProgramOrder" ADD CONSTRAINT "ProgramOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramOrder" ADD CONSTRAINT "ProgramOrder_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramOrderItem" ADD CONSTRAINT "ProgramOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProgramOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
