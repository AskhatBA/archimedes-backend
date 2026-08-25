-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('BALANCE_TOPUP', 'APPOINTMENT');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "purpose" "PaymentPurpose" NOT NULL DEFAULT 'BALANCE_TOPUP';
