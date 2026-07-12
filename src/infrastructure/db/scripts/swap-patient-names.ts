/**
 * One-off fix: firstName and lastName were stored swapped for Patient rows
 * (the controller used to write req.body.lastName into firstName and vice
 * versa). This swaps the two columns back and rebuilds fullName as
 * `${firstName} ${lastName}`, matching how createPatient now writes it.
 *
 * RUN THIS ON PLAINTEXT DATA — i.e. BEFORE `npm run db:encrypt-pii`.
 * (A pure column swap would also work on encrypted data, but rebuilding
 * fullName needs the plaintext values.)
 *
 * PostgreSQL evaluates all right-hand sides against the OLD row, so the
 * swap is atomic and needs no temporary column.
 *
 * Run with:  npx ts-node -r tsconfig-paths/register \
 *              src/infrastructure/db/scripts/swap-patient-names.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const main = async () => {
  const affected = await prisma.$executeRawUnsafe(`
    UPDATE "Patient"
    SET "firstName" = "lastName",
        "lastName"  = "firstName",
        "fullName"  = "lastName" || ' ' || "firstName"
  `);
  console.log(`Patient: swapped firstName/lastName on ${affected} row(s).`);
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
