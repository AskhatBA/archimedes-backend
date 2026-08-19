import { Worker } from 'bullmq';

import { reconcilePendingPayments } from '@/domains/payment/payment.service';
import { redisConnection } from '@/infrastructure/redis';
import { createLogger } from '@/shared/lib/logger';

import { PAYMENT_RECONCILIATION_QUEUE } from './payment-reconciliation.queue';

const workerLogger = createLogger('payment-reconciliation-worker');

export const paymentReconciliationWorker = new Worker(
  PAYMENT_RECONCILIATION_QUEUE,
  async () => {
    const result = await reconcilePendingPayments();

    // Quiet sweeps are the normal case, so only say something when work happened.
    if (result.checked === 0 && result.expired === 0) {
      workerLogger.debug('Reconciliation sweep found nothing pending');
      return result;
    }

    workerLogger.info(result, 'Reconciliation sweep finished');
    return result;
  },
  {
    connection: redisConnection,
    // One sweep at a time: overlapping runs would query the same payments twice and
    // double the request rate against FreedomPay.
    concurrency: 1,
  }
);

paymentReconciliationWorker.on('failed', (job, err) => {
  workerLogger.error({ jobId: job?.id, err }, 'Reconciliation sweep failed');
});

paymentReconciliationWorker.on('error', (err) => {
  workerLogger.error({ err }, 'Worker error');
});

export const startPaymentReconciliationWorker = () => {
  workerLogger.info({ queue: PAYMENT_RECONCILIATION_QUEUE }, 'Payment reconciliation worker started');
  return paymentReconciliationWorker;
};

export const stopPaymentReconciliationWorker = async () => {
  await paymentReconciliationWorker.close();
  workerLogger.info('Payment reconciliation worker stopped');
};
