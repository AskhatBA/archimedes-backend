import { Queue } from 'bullmq';

import { redisConnection } from '@/infrastructure/redis';
import { createLogger } from '@/shared/lib/logger';

const queueLogger = createLogger('med-account-credit-queue');

export const MED_ACCOUNT_CREDIT_QUEUE = 'med-account-credit';
export const MED_ACCOUNT_CREDIT_JOB = 'credit-med-account-topup';

export interface MedAccountCreditJobData {
  topupId: string;
}

export const medAccountCreditQueue = new Queue<MedAccountCreditJobData>(
  MED_ACCOUNT_CREDIT_QUEUE,
  {
    connection: redisConnection,
    defaultJobOptions: {
      // Страховая может быть недоступна минуту-другую — повторяем, а не бросаем
      // оплаченное пополнение с первой ошибки.
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { age: 24 * 3600, count: 500 },
      // Неудачные держим неделю: по ним видно, что деньги взяли, а на счёт не зачислили.
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  }
);

/**
 * Ставит зачисление оплаченного пополнения в очередь.
 *
 * `jobId` привязан к пополнению, поэтому переигранный колбэк FreedomPay или сверка
 * платежей не создадут второе зачисление той же суммы.
 */
export const enqueueMedAccountCredit = async (topupId: string): Promise<void> => {
  await medAccountCreditQueue.add(
    MED_ACCOUNT_CREDIT_JOB,
    { topupId },
    { jobId: `med-account-credit-${topupId}` }
  );

  queueLogger.info({ topupId }, 'Med-account topup credit queued');
};
