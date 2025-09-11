-- CreateTable
CREATE TABLE "InsuranceServiceToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accessToken" TEXT NOT NULL,

    CONSTRAINT "InsuranceServiceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceServiceToken_userId_key" ON "InsuranceServiceToken"("userId");

-- AddForeignKey
ALTER TABLE "InsuranceServiceToken" ADD CONSTRAINT "InsuranceServiceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
