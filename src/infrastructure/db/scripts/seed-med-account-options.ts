/**
 * Seed (or re-seed) the top-up amounts served at `GET /v1/api/med-account/options`.
 *
 * These are the amounts the mobile app offers on the "пополнить медсчёт" screen. The
 * list is owned by the dashboard from here on — this script only puts a sensible one in
 * place so the screen is not empty on a fresh database.
 *
 * Upserts on `amount`, so it is safe to re-run: it restores the ordering and republishes
 * an amount that was hidden, and leaves `label` and `popular` — the columns an operator
 * curates — untouched on rows that already exist. Amounts missing from the list below are
 * left alone; retire one from the dashboard rather than deleting it here.
 *
 * Run with:  npm run db:seed-med-account-options
 */
import { prismaClient } from '@/infrastructure/db';

interface TopupOptionSeed {
  /** Amount in tenge. */
  amount: number;
  sortOrder: number;
}

const OPTIONS: TopupOptionSeed[] = [
  { amount: 20_000, sortOrder: 10 },
  { amount: 60_000, sortOrder: 20 },
  { amount: 100_000, sortOrder: 30 },
  { amount: 150_000, sortOrder: 40 },
  { amount: 200_000, sortOrder: 50 },
  { amount: 250_000, sortOrder: 60 },
  { amount: 300_000, sortOrder: 70 },
  { amount: 400_000, sortOrder: 80 },
];

const main = async () => {
  for (const option of OPTIONS) {
    const { amount, sortOrder } = option;

    await prismaClient.medAccountTopupOption.upsert({
      where: { amount },
      update: { sortOrder, isActive: true },
      create: { amount, sortOrder },
    });
  }

  console.log(`✓ Seeded ${OPTIONS.length} med-account top-up amount(s).`);
};

main()
  .catch((err) => {
    console.error('✗ Failed to seed the med-account top-up amounts:', err);
    process.exit(1);
  })
  .finally(() => prismaClient.$disconnect());
