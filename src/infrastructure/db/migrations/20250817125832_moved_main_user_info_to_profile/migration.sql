/*
  Warnings:

  - You are about to drop the column `firstName` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `lastName` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `patronymic` on the `User` table. All the data in the column will be lost.
  - Added the required column `firstName` to the `Doctor` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lastName` to the `Doctor` table without a default value. This is not possible if the table is not empty.
  - Added the required column `patronymic` to the `Doctor` table without a default value. This is not possible if the table is not empty.
  - Added the required column `firstName` to the `Patient` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lastName` to the `Patient` table without a default value. This is not possible if the table is not empty.
  - Added the required column `patronymic` to the `Patient` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "firstName" TEXT NOT NULL,
ADD COLUMN     "lastName" TEXT NOT NULL,
ADD COLUMN     "patronymic" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "firstName" TEXT NOT NULL,
ADD COLUMN     "lastName" TEXT NOT NULL,
ADD COLUMN     "patronymic" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "firstName",
DROP COLUMN "lastName",
DROP COLUMN "patronymic",
ALTER COLUMN "email" DROP NOT NULL;
