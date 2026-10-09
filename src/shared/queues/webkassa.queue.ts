import { Job, Queue, QueueEvents } from 'bullmq';

import { config } from '@/config';
import { redisConnection } from '@/infrastructure/redis';
import { createLogger } from '@/shared/lib/logger';

const queueLogger = createLogger('webkassa-queue');

/**
 * Одна очередь на **все** операции с кассой — чеки, Z-отчёты, проход-сверку.
 *
 * Webkassa требует строго последовательных запросов по одной кассе (параллельные дают
 * ошибку 9), поэтому воркер берёт по одной задаче (`concurrency: 1`), а глобальная
 * конкурентность очереди — 1, чтобы последовательность держалась и при нескольких
 * экземплярах бэкенда.
 */
export const WEBKASSA_QUEUE = 'webkassa';

export const WEBKASSA_JOBS = {
  issueReceipt: 'issue-receipt',
  closeShift: 'close-shift',
  sweep: 'sweep',
} as const;

export interface IssueReceiptJobData {
  receiptId: string;
}

/** Один id на каждое расписание, чтобы рестарты обновляли его, а не плодили новые. */
const SHIFT_CLOSE_SCHEDULER_ID = 'webkassa-daily-z-report';
const SWEEP_SCHEDULER_ID = 'webkassa-pending-receipts-sweep';

/** Время кассы и расписания Z-отчёта. */
const CASHBOX_TIMEZONE = 'Asia/Almaty';

/** Первая пауза между повторами чека; дальше — экспоненциально. */
const RECEIPT_BACKOFF_MS = 30_000;

export const webkassaQueue = new Queue(WEBKASSA_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { age: 24 * 3600, count: 500 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

/**
 * `jobId` задачи чека. `retryRound` растёт с каждым ручным повтором из дашборда — без
 * него BullMQ отверг бы повтор как дубль уже существующей задачи.
 */
export const receiptJobId = (receiptId: string, retryRound = 0): string =>
  `fiscal-receipt-${receiptId}-${retryRound}`;

/**
 * Ставит регистрацию чека в очередь.
 *
 * Повторы автоматические и безопасны, в отличие от `appointment-refund` с его
 * `attempts: 1`: повтор с тем же `ExternalCheckNumber` не пробивает второй чек, а
 * возвращает ошибку 14 с реквизитами первого. Дедупликация — по `jobId`, так что
 * постановка после оплаты и проход-сверка не создадут двух задач на один чек.
 *
 * Завершённая задача удаляется сразу: иначе проход-сверка не смогла бы снова поставить
 * чек, который остался PENDING (например, пока был выключен `WEBKASSA_ENABLED`).
 */
export const enqueueFiscalReceipt = async (receiptId: string, retryRound = 0): Promise<void> => {
  await webkassaQueue.add(WEBKASSA_JOBS.issueReceipt, { receiptId } satisfies IssueReceiptJobData, {
    jobId: receiptJobId(receiptId, retryRound),
    attempts: config.webkassa.maxAttempts,
    backoff: { type: 'exponential', delay: RECEIPT_BACKOFF_MS },
    removeOnComplete: true,
    removeOnFail: { age: 24 * 3600 },
  });

  queueLogger.debug({ receiptId, retryRound }, 'Fiscal receipt queued');
};

/** Ручной Z-отчёт из дашборда — через ту же очередь, чтобы не обогнать чеки. */
export const enqueueShiftClose = (): Promise<Job> =>
  webkassaQueue.add(WEBKASSA_JOBS.closeShift, { manual: true });

let queueEvents: QueueEvents | null = null;

/** События очереди нужны только ручному Z-отчёту, который ждёт результата задачи. */
export const getWebkassaQueueEvents = (): QueueEvents => {
  if (!queueEvents) {
    // Отдельное соединение: QueueEvents держит блокирующее чтение потока.
    queueEvents = new QueueEvents(WEBKASSA_QUEUE, { connection: redisConnection.duplicate() });
  }
  return queueEvents;
};

export const closeWebkassaQueueEvents = async (): Promise<void> => {
  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
  }
};

/**
 * Глобальная конкурентность и расписания: ежедневный Z-отчёт и проход-сверка.
 *
 * `upsertJobScheduler` идемпотентен — каждый старт обновляет одно расписание. Пустой
 * `WEBKASSA_SHIFT_CLOSE_CRON` снимает расписание Z-отчёта, поставленное прошлым запуском.
 */
export const scheduleWebkassa = async (): Promise<void> => {
  await webkassaQueue.setGlobalConcurrency(1);

  const everyMs = config.webkassa.sweepIntervalSeconds * 1000;
  await webkassaQueue.upsertJobScheduler(
    SWEEP_SCHEDULER_ID,
    { every: everyMs },
    { name: WEBKASSA_JOBS.sweep }
  );

  const pattern = config.webkassa.shiftCloseCron.trim();

  if (pattern) {
    await webkassaQueue.upsertJobScheduler(
      SHIFT_CLOSE_SCHEDULER_ID,
      { pattern, tz: CASHBOX_TIMEZONE },
      { name: WEBKASSA_JOBS.closeShift, data: { manual: false } }
    );
  } else {
    await webkassaQueue.removeJobScheduler(SHIFT_CLOSE_SCHEDULER_ID);
  }

  queueLogger.info(
    { queue: WEBKASSA_QUEUE, sweepEveryMs: everyMs, shiftCloseCron: pattern || null },
    'Webkassa queue scheduled'
  );
};
