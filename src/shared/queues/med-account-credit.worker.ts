import { Worker } from 'bullmq';

import { creditTopup } from '@/domains/med-account/med-account.credit.service';
import { redisConnection } from '@/infrastructure/redis';
import { createLogger } from '@/shared/lib/logger';

import { MED_ACCOUNT_CREDIT_QUEUE, MedAccountCreditJobData } from './med-account-credit.queue';

const workerLogger = createLogger('med-account-credit-worker');

export const medAccountCreditWorker = new Worker<MedAccountCreditJobData>(
  MED_ACCOUNT_CREDIT_QUEUE,
  async (job) => {
    const { topupId } = job.data;

    // `creditTopup` не бросает: оно само переводит пополнение в CREDITED или FAILED и
    // возвращает итог. Джоба падает только на неожиданной ошибке инфраструктуры.
    const status = await creditTopup(topupId);

    workerLogger.info({ topupId, status }, 'Med-account topup credit processed');
  },
  {
    connection: redisConnection,
    // Зачисления денежные и идут по одному — параллелить нечего.
    concurrency: 1,
  }
);

medAccountCreditWorker.on('failed', (job, err) => {
  // `creditTopup` сама переводит пополнение в FAILED, так что сюда попадает только
  // неожиданная ошибка инфраструктуры — деньги уже взяты, поэтому это всегда error.
  workerLogger.error(
    { jobId: job?.id, topupId: job?.data?.topupId, attempts: job?.attemptsMade, err },
    'Med-account topup credit job failed'
  );
});

medAccountCreditWorker.on('error', (err) => {
  workerLogger.error({ err }, 'Worker error');
});

export const startMedAccountCreditWorker = () => {
  workerLogger.info({ queue: MED_ACCOUNT_CREDIT_QUEUE }, 'Med-account credit worker started');
  return medAccountCreditWorker;
};

export const stopMedAccountCreditWorker = async () => {
  await medAccountCreditWorker.close();
  workerLogger.info('Med-account credit worker stopped');
};
