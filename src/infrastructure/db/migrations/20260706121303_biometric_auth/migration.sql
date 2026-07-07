/*
  Warnings:

  - You are about to drop the column `refreshToken` on the `User` table. All the data in the column will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEvent" ADD VALUE 'AUTH_TOKEN_REFRESHED';
ALTER TYPE "AuditEvent" ADD VALUE 'AUTH_REFRESH_FAILED';
ALTER TYPE "AuditEvent" ADD VALUE 'AUTH_PIN_VERIFY_SUCCESS';
ALTER TYPE "AuditEvent" ADD VALUE 'AUTH_PIN_VERIFY_FAILED';
ALTER TYPE "AuditEvent" ADD VALUE 'AUTH_PIN_LOCKED';
ALTER TYPE "AuditEvent" ADD VALUE 'USER_PIN_SET';
ALTER TYPE "AuditEvent" ADD VALUE 'USER_BIOMETRIC_ENABLED';
ALTER TYPE "AuditEvent" ADD VALUE 'USER_BIOMETRIC_DISABLED';

-- AlterTable
ALTER TABLE "User" DROP COLUMN "refreshToken",
ADD COLUMN     "biometricEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinFailedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pinHash" TEXT,
ADD COLUMN     "pinLockedUntil" TIMESTAMP(3),
ADD COLUMN     "refreshTokenHash" TEXT;
