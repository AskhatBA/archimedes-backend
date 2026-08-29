import { Worker } from 'bullmq';

import { syncAppointmentStatuses } from '@/domains/appointments/appointments.sync.service';
import { redisConnection } from '@/infrastructure/redis';
import { createLogger } from '@/shared/lib/logger';

import { APPOINTMENT_SYNC_QUEUE } from './appointment-sync.queue';

const workerLogger = createLogger('appointment-sync-worker');

export const appointmentSyncWorker = new Worker(
  APPOINTMENT_SYNC_QUEUE,
  async () => {
    const result = await syncAppointmentStatuses();

    // Обычный проход ничего не меняет, поэтому в info попадает только то, где была работа.
    if (result.updated === 0 && result.notFound === 0 && result.failedPatients === 0) {
      workerLogger.debug(result, 'Appointment status sweep found no changes');
      return result;
    }

    workerLogger.info(result, 'Appointment status sweep finished');
    return result;
  },
  {
    connection: redisConnection,
    // Строго по одному проходу: параллельные запуски спросили бы у МИС одно и то же дважды.
    concurrency: 1,
  }
);

appointmentSyncWorker.on('failed', (job, err) => {
  workerLogger.error({ jobId: job?.id, err }, 'Appointment status sweep failed');
});

appointmentSyncWorker.on('error', (err) => {
  workerLogger.error({ err }, 'Worker error');
});

export const startAppointmentSyncWorker = () => {
  workerLogger.info({ queue: APPOINTMENT_SYNC_QUEUE }, 'Appointment status sync worker started');
  return appointmentSyncWorker;
};

export const stopAppointmentSyncWorker = async () => {
  await appointmentSyncWorker.close();
  workerLogger.info('Appointment status sync worker stopped');
};
