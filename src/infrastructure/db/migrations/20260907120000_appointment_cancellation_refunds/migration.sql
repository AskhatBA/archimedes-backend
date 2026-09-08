-- CreateEnum
CREATE TYPE "AppointmentRefundStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEvent" ADD VALUE 'APPOINTMENT_CANCELLED';
ALTER TYPE "AuditEvent" ADD VALUE 'APPOINTMENT_REFUND_CREATED';
ALTER TYPE "AuditEvent" ADD VALUE 'APPOINTMENT_REFUND_PROCESSED';
ALTER TYPE "AuditEvent" ADD VALUE 'APPOINTMENT_REFUND_STATUS_CHANGED';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "paymentId" UUID;

-- CreateTable
CREATE TABLE "AppointmentRefund" (
    "id" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL,
    "refundPercent" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "feeAmount" DOUBLE PRECISION NOT NULL,
    "hoursBefore" DOUBLE PRECISION NOT NULL,
    "status" "AppointmentRefundStatus" NOT NULL DEFAULT 'PENDING',
    "externalRef" TEXT,
    "comment" TEXT,
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentRefund_appointmentId_key" ON "AppointmentRefund"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentRefund_paymentId_key" ON "AppointmentRefund"("paymentId");

-- CreateIndex
CREATE INDEX "AppointmentRefund_userId_idx" ON "AppointmentRefund"("userId");

-- CreateIndex
CREATE INDEX "AppointmentRefund_status_createdAt_idx" ON "AppointmentRefund"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AppointmentRefund_createdAt_idx" ON "AppointmentRefund"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_paymentId_key" ON "Appointment"("paymentId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentRefund" ADD CONSTRAINT "AppointmentRefund_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentRefund" ADD CONSTRAINT "AppointmentRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentRefund" ADD CONSTRAINT "AppointmentRefund_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
