import { Queue } from 'bullmq';

import { config } from '@/config';
import { redisConnection } from '@/infrastructure/redis';
import { createLogger } from '@/shared/lib/logger';

const queueLogger = createLogger('payment-reconciliation-queue');

export const PAYMENT_RECONCILIATION_QUEUE = 'payment-reconciliation';
export const PAYMENT_RECONCILIATION_JOB = 'reconcile-pending-payments';

/** One scheduler id, so restarts re-use the same schedule instead of stacking new ones. */
const SCHEDULER_ID = 'pending-payments-sweep';

export const paymentReconciliationQueue = new Queue(PAYMENT_RECONCILIATION_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    // A sweep is stateless and the next occurrence retries the same work anyway, so a
    // failed run is left to the schedule rather than retried on its own.
    attempts: 1,
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: { age: 24 * 3600 },
  },
});

/**
 * Registers the repeating sweep that settles payments whose result callback never arrived.
 *
 * `upsertJobScheduler` is idempotent: every process start updates the one schedule instead
 * of adding another, which keeps the interval intact across deploys and restarts.
 */
export const schedulePaymentReconciliation = async () => {
  const every = config.freedomPay.reconcile.intervalSeconds * 1000;

  await paymentReconciliationQueue.upsertJobScheduler(
    SCHEDULER_ID,
    { every },
    { name: PAYMENT_RECONCILIATION_JOB }
  );

  queueLogger.info(
    { queue: PAYMENT_RECONCILIATION_QUEUE, everyMs: every },
    'Payment reconciliation scheduled'
  );
};
