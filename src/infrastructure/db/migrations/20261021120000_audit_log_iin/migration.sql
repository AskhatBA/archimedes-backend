-- AlterEnum
ALTER TYPE "AuditEvent" ADD VALUE 'AUTH_ATTEMPTS_VIEWED';

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "iin" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_iin_idx" ON "AuditLog"("iin");
