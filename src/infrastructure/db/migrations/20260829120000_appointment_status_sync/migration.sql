-- AlterEnum
ALTER TYPE "AuditEvent" ADD VALUE 'APPOINTMENT_STATUS_SYNCED';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "misStatus" TEXT,
ADD COLUMN     "statusSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Appointment_status_dateTime_idx" ON "Appointment"("status", "dateTime");
