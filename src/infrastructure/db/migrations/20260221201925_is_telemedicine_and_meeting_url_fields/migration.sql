-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "isTelemedicine" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "meetingUrl" TEXT;
