import { Job, Worker } from 'bullmq';

import * as fiscalService from '@/domains/fiscal/fiscal.service';
import { redisConnection } from '@/infrastructure/redis';
import { createLogger } from '@/shared/lib/logger';

import {
  IssueReceiptJobData,
  WEBKASSA_JOBS,
  WEBKASSA_QUEUE,
  closeWebkassaQueueEvents,
  scheduleWebkassa,
} from './webkassa.queue';

const workerLogger = createLogger('webkassa-worker');

const isLastAttempt = (job: Job): boolean => job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

export const webkassaWorker = new Worker(
  WEBKASSA_QUEUE,
  async (job) => {
    switch (job.name) {
      case WEBKASSA_JOBS.issueReceipt: {
        const { receiptId } = job.data as IssueReceiptJobData;
        // Бросает только намеренную FiscalRetryableError — тогда BullMQ повторит с паузой.
        return fiscalService.issueReceipt(receiptId, { isLastAttempt: isLastAttempt(job) });
      }
      case WEBKASSA_JOBS.closeShift:
        // Ручной Z-отчёт ждёт результата и сам проверяет готовность кассы; плановый —
        // молча пропускается, если касса выключена.
        return job.data?.manual
          ? fiscalService.closeShift()
          : fiscalService.runScheduledShiftClose();
      case WEBKASSA_JOBS.sweep: {
        const result = await fiscalService.sweepPendingReceipts();
        if (result.queued > 0) workerLogger.info(result, 'Pending fiscal receipts re-queued');
        return result;
      }
      default:
        workerLogger.warn({ jobName: job.name }, 'Unknown Webkassa job');
        return null;
    }
  },
  {
    connection: redisConnection,
    // Webkassa требует строго последовательных запросов по кассе.
    concurrency: 1,
  }
);

webkassaWorker.on('failed', (job, err) => {
  if (!job) return;

  if (job.name !== WEBKASSA_JOBS.issueReceipt) {
    workerLogger.error({ jobId: job.id, jobName: job.name, err }, 'Webkassa job failed');
    return;
  }

  const { receiptId } = job.data as IssueReceiptJobData;
  const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);

  if (!exhausted) {
    workerLogger.warn(
      { jobId: job.id, receiptId, attemptsMade: job.attemptsMade, error: err?.message },
      'Fiscal receipt attempt failed, will retry'
    );
    return;
  }

  // Обычно последнюю попытку закрывает сама `issueReceipt`; сюда попадает неожиданный сбой.
  void fiscalService
    .failReceiptAfterRetries(receiptId, String(err?.message ?? 'Исчерпаны попытки'))
    .catch((error) => {
      workerLogger.error({ err: error, receiptId }, 'Failed to mark fiscal receipt FAILED');
    });
});

webkassaWorker.on('error', (err) => {
  workerLogger.error({ err }, 'Worker error');
});

export const startWebkassaWorker = () => {
  const blocker = fiscalService.getWebkassaBlocker();
  if (blocker) fiscalService.logWebkassaBlocker(blocker, { phase: 'startup' });

  void scheduleWebkassa().catch((err) => {
    workerLogger.error({ err }, 'Failed to schedule Webkassa jobs');
  });

  workerLogger.info({ queue: WEBKASSA_QUEUE }, 'Webkassa worker started');
  return webkassaWorker;
};

export const stopWebkassaWorker = async () => {
  await webkassaWorker.close();
  await closeWebkassaQueueEvents();
  workerLogger.info('Webkassa worker stopped');
};
