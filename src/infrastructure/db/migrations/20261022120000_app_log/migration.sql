-- AlterEnum
ALTER TYPE "AuditEvent" ADD VALUE 'APP_LOGS_VIEWED';

-- CreateTable
CREATE TABLE "AppLog" (
    "id" BIGSERIAL NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "level" TEXT NOT NULL,
    "msg" TEXT,
    "reqId" TEXT,
    "userId" UUID,
    "component" TEXT,
    "method" TEXT,
    "url" TEXT,
    "statusCode" INTEGER,
    "durationMs" INTEGER,
    "data" JSONB NOT NULL,

    CONSTRAINT "AppLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppLog_time_idx" ON "AppLog"("time");

-- CreateIndex
CREATE INDEX "AppLog_reqId_idx" ON "AppLog"("reqId");

-- CreateIndex
CREATE INDEX "AppLog_userId_time_idx" ON "AppLog"("userId", "time");

-- CreateIndex
CREATE INDEX "AppLog_level_time_idx" ON "AppLog"("level", "time");
