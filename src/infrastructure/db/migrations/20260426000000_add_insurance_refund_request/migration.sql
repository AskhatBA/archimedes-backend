-- CreateTable
CREATE TABLE "InsuranceRefundRequest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "category" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "comments" TEXT,
    "files" JSONB NOT NULL,
    "externalResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsuranceRefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsuranceRefundRequest_userId_idx" ON "InsuranceRefundRequest"("userId");

-- CreateIndex
CREATE INDEX "InsuranceRefundRequest_createdAt_idx" ON "InsuranceRefundRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "InsuranceRefundRequest" ADD CONSTRAINT "InsuranceRefundRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
