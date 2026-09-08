import { Queue } from 'bullmq';

import { redisConnection } from '@/infrastructure/redis';
import { createLogger } from '@/shared/lib/logger';

const queueLogger = createLogger('appointment-refund-queue');

export const APPOINTMENT_REFUND_QUEUE = 'appointment-refund';
export const APPOINTMENT_REFUND_JOB = 'refund-cancelled-appointment';

export interface AppointmentRefundJobData {
  refundId: string;
}

export const appointmentRefundQueue = new Queue<AppointmentRefundJobData>(
  APPOINTMENT_REFUND_QUEUE,
  {
    connection: redisConnection,
    defaultJobOptions: {
      // Ровно одна попытка, и это не экономия: у `revoke.php` нет ключа идемпотентности, а
      // частичные возвраты по одному платежу суммируются, поэтому повтор джобы, упавшей
      // между вызовом провайдера и записью результата, вернул бы деньги дважды. Если джоба
      // умерла, строка возврата остаётся PENDING и попадает оператору в дашборд — это
      // восстановимая сторона, в отличие от двойного возврата.
      attempts: 1,
      removeOnComplete: { age: 24 * 3600, count: 500 },
      // Упавшие держим неделю: по ним видно возвраты, которые никто не провёл.
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  }
);

/**
 * Ставит возврат за отменённый платный приём в очередь.
 *
 * `jobId` привязан к строке возврата, поэтому повторное нажатие «отменить» или
 * параллельный запрос не создадут вторую отправку той же суммы в FreedomPay.
 */
export const enqueueAppointmentRefund = async (refundId: string): Promise<void> => {
  await appointmentRefundQueue.add(
    APPOINTMENT_REFUND_JOB,
    { refundId },
    { jobId: `appointment-refund-${refundId}` }
  );

  queueLogger.info({ refundId }, 'Appointment refund queued');
};
