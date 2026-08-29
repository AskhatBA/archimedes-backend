import { Worker } from 'bullmq';

import { sendProgramOrderEmail } from '@/domains/program-orders/program-order.email';
import { getOrderForEmail } from '@/domains/program-orders/program-orders.service';
import { redisConnection } from '@/infrastructure/redis';
import { createLogger } from '@/shared/lib/logger';

import {
  PROGRAM_ORDER_EMAIL_QUEUE,
  ProgramOrderEmailJobData,
} from './program-order-email.queue';

const workerLogger = createLogger('program-order-email-worker');

export const programOrderEmailWorker = new Worker<ProgramOrderEmailJobData>(
  PROGRAM_ORDER_EMAIL_QUEUE,
  async (job) => {
    const { orderId } = job.data;

    const order = await getOrderForEmail(orderId);

    if (!order) {
      // Заявку удалили между оплатой и отправкой — повторять нечего.
      workerLogger.warn({ orderId }, 'Program order gone, email skipped');
      return;
    }

    await sendProgramOrderEmail(order);

    workerLogger.info({ orderId, total: order.total }, 'Program order email sent');
  },
  {
    connection: redisConnection,
    // Писем немного, а релей не любит параллельных сессий.
    concurrency: 1,
  }
);

programOrderEmailWorker.on('failed', (job, err) => {
  workerLogger.error(
    { jobId: job?.id, orderId: job?.data?.orderId, attempts: job?.attemptsMade, err },
    'Program order email failed'
  );
});

programOrderEmailWorker.on('error', (err) => {
  workerLogger.error({ err }, 'Worker error');
});

export const startProgramOrderEmailWorker = () => {
  workerLogger.info({ queue: PROGRAM_ORDER_EMAIL_QUEUE }, 'Program order email worker started');
  return programOrderEmailWorker;
};

export const stopProgramOrderEmailWorker = async () => {
  await programOrderEmailWorker.close();
  workerLogger.info('Program order email worker stopped');
};
