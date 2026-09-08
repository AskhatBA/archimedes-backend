import { Worker } from 'bullmq';

import { processAppointmentRefund } from '@/domains/appointments/appointment-refund.service';
import { redisConnection } from '@/infrastructure/redis';
import { createLogger } from '@/shared/lib/logger';

import { APPOINTMENT_REFUND_QUEUE, AppointmentRefundJobData } from './appointment-refund.queue';

const workerLogger = createLogger('appointment-refund-worker');

export const appointmentRefundWorker = new Worker<AppointmentRefundJobData>(
  APPOINTMENT_REFUND_QUEUE,
  async (job) => {
    const { refundId } = job.data;

    // `processAppointmentRefund` не бросает: оно само переводит возврат в COMPLETED или
    // FAILED и возвращает итог. Сюда исключение приходит только от инфраструктуры.
    const status = await processAppointmentRefund(refundId);

    workerLogger.info({ refundId, status }, 'Appointment refund processed');
  },
  {
    connection: redisConnection,
    // Возвраты денежные и идут по одному — параллелить нечего.
    concurrency: 1,
  }
);

appointmentRefundWorker.on('failed', (job, err) => {
  // Строку в FAILED переводит сама `processAppointmentRefund`, поэтому сюда попадает только
  // неожиданный сбой — и тогда возврат остался PENDING, а деньги пациенту так и должны.
  workerLogger.error(
    { jobId: job?.id, refundId: job?.data?.refundId, err },
    'Appointment refund job failed, refund is left for an operator'
  );
});

appointmentRefundWorker.on('error', (err) => {
  workerLogger.error({ err }, 'Worker error');
});

export const startAppointmentRefundWorker = () => {
  workerLogger.info({ queue: APPOINTMENT_REFUND_QUEUE }, 'Appointment refund worker started');
  return appointmentRefundWorker;
};

export const stopAppointmentRefundWorker = async () => {
  await appointmentRefundWorker.close();
  workerLogger.info('Appointment refund worker stopped');
};
