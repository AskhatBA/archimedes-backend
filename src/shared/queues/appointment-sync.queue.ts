import { Queue } from 'bullmq';

import { config } from '@/config';
import { redisConnection } from '@/infrastructure/redis';
import { createLogger } from '@/shared/lib/logger';

const queueLogger = createLogger('appointment-sync-queue');

export const APPOINTMENT_SYNC_QUEUE = 'appointment-status-sync';
export const APPOINTMENT_SYNC_JOB = 'sync-appointment-statuses';

/** Один id расписания, чтобы рестарты обновляли его, а не плодили новые. */
const SCHEDULER_ID = 'appointment-status-sweep';

export const appointmentSyncQueue = new Queue(APPOINTMENT_SYNC_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    // Проход не хранит состояния, следующий по расписанию сделает ту же работу, поэтому
    // упавший запуск не перезапускаем отдельно.
    attempts: 1,
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: { age: 24 * 3600 },
  },
});

/**
 * Ставит повторяющийся проход, который подтягивает статусы приёмов из МИС.
 *
 * `upsertJobScheduler` идемпотентен: каждый старт процесса обновляет одно расписание, а не
 * добавляет ещё одно, поэтому интервал переживает деплои и рестарты.
 */
export const scheduleAppointmentSync = async () => {
  const every = config.mis.appointmentSync.intervalSeconds * 1000;

  await appointmentSyncQueue.upsertJobScheduler(
    SCHEDULER_ID,
    { every },
    { name: APPOINTMENT_SYNC_JOB }
  );

  queueLogger.info(
    { queue: APPOINTMENT_SYNC_QUEUE, everyMs: every },
    'Appointment status sync scheduled'
  );
};

/** Снимает расписание — нужно, когда синхронизацию выключили через конфиг. */
export const unscheduleAppointmentSync = async () => {
  const removed = await appointmentSyncQueue.removeJobScheduler(SCHEDULER_ID);

  if (removed) {
    queueLogger.info({ queue: APPOINTMENT_SYNC_QUEUE }, 'Appointment status sync unscheduled');
  }
};
