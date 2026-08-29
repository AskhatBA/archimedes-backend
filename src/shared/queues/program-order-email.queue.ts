import { Queue } from 'bullmq';

import { redisConnection } from '@/infrastructure/redis';
import { createLogger } from '@/shared/lib/logger';

const queueLogger = createLogger('program-order-email-queue');

export const PROGRAM_ORDER_EMAIL_QUEUE = 'program-order-email';
export const PROGRAM_ORDER_EMAIL_JOB = 'send-program-order-email';

export interface ProgramOrderEmailJobData {
  orderId: string;
}

export const programOrderEmailQueue = new Queue<ProgramOrderEmailJobData>(
  PROGRAM_ORDER_EMAIL_QUEUE,
  {
    connection: redisConnection,
    defaultJobOptions: {
      // Релей может быть недоступен минуту-другую, поэтому повторяем с паузами,
      // а не теряем заявку с первой ошибки.
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { age: 24 * 3600, count: 500 },
      // Неотправленные письма держим неделю — по ним видно, что заявка не дошла.
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  }
);

/**
 * Ставит письмо о новой оплаченной заявке в очередь.
 *
 * `jobId` привязан к заявке, поэтому повторный вызов (переигранный колбэк
 * FreedomPay, сверка платежей) не создаёт второе письмо.
 */
export const enqueueProgramOrderEmail = async (orderId: string): Promise<void> => {
  await programOrderEmailQueue.add(
    PROGRAM_ORDER_EMAIL_JOB,
    { orderId },
    { jobId: `program-order-email-${orderId}` }
  );

  queueLogger.info({ orderId }, 'Program order email queued');
};
