-- AlterEnum
-- The payer abandoned the provider's page and asked us to drop the order. Only ever
-- written to a payment FreedomPay has not settled, and never final against them: a
-- CANCELLED payment that still gets paid is settled as SUCCESS by the callback or the
-- reconciliation sweep.
ALTER TYPE "PaymentStatus" ADD VALUE 'CANCELLED';
