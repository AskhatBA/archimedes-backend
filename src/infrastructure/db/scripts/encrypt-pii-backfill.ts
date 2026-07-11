/**
 * One-off backfill: encrypt existing plaintext PII in Patient and Doctor.
 *
 * Uses a RAW PrismaClient (no encryption extension) so it reads the real
 * stored values, encrypts any that are not yet encrypted, and writes them
 * back with raw SQL (bypassing the extension to avoid double-encryption).
 *
 * Safe to run multiple times — already-encrypted rows are skipped.
 *
 * Run with:  npx ts-node -r tsconfig-paths/register \
 *              src/infrastructure/db/scripts/encrypt-pii-backfill.ts
 */
import { PrismaClient } from '@prisma/client';

import { encryptField, isEncrypted } from '@/shared/services/encryption.service';

const prisma = new PrismaClient();

const FIELDS = ['firstName', 'lastName', 'patronymic', 'fullName'] as const;

type Row = {
  id: string;
  firstName: string;
  lastName: string;
  patronymic: string;
  fullName: string;
};

const backfillTable = async (table: 'Patient' | 'Doctor') => {
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT id, "firstName", "lastName", "patronymic", "fullName" FROM "${table}"`,
  );

  let updated = 0;
  for (const row of rows) {
    const updates: Partial<Record<(typeof FIELDS)[number], string>> = {};
    for (const field of FIELDS) {
      const value = row[field];
      if (typeof value === 'string' && value.length > 0 && !isEncrypted(value)) {
        updates[field] = encryptField(value);
      }
    }

    const entries = Object.entries(updates);
    if (entries.length === 0) continue;

    const setClause = entries.map(([f], i) => `"${f}" = $${i + 1}`).join(', ');
    const params = [...entries.map(([, v]) => v), row.id];
    await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET ${setClause} WHERE id = $${params.length}::uuid`,
      ...params,
    );
    updated += 1;
  }

  console.log(`${table}: encrypted ${updated}/${rows.length} row(s).`);
};

const main = async () => {
  await backfillTable('Patient');
  await backfillTable('Doctor');
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
