import { Worker, Job } from 'bullmq';

import { redisConnection } from '@/infrastructure/redis';
import * as db from '@/infrastructure/db';
import { sendPushNotification } from '@/domains/notifications/notifications.service';
import { createLogger } from '@/shared/lib/logger';

import { AppointmentNotificationJobData, AppointmentReminderKey } from './notification.queue';

const workerLogger = createLogger('notification-worker');

// Russian lead-in for each reminder, e.g. "У вас приём через 3 часа ..."
const REMINDER_LEAD_TIME: Record<AppointmentReminderKey, string> = {
  '3h': 'через 3 часа',
  '1h': 'через час',
};

export const appointmentNotificationWorker = new Worker<AppointmentNotificationJobData>(
  'appointment-notifications',
  async (job: Job<AppointmentNotificationJobData>) => {
    const { appointmentId, reminder } = job.data;
    const jobLogger = workerLogger.child({ jobId: job.id, appointmentId, reminder });
    const startedAt = Date.now();

    try {
      // Fetch appointment details
      const appointment = await db.prismaClient.appointment.findUnique({
        where: { id: appointmentId },
      });

      if (!appointment) {
        jobLogger.warn('Appointment not found, skipping notification');
        return { success: false, reason: 'Appointment not found' };
      }

      // Only send notification for scheduled appointments
      if (appointment.status !== 'SCHEDULED') {
        jobLogger.info(
          { status: appointment.status },
          'Appointment is not scheduled, skipping notification'
        );
        return { success: false, reason: 'Appointment not scheduled' };
      }

      // Format date and time in user's local zone (Asia/Almaty, UTC+5)
      const appointmentDate = new Date(appointment.dateTime);
      const timeZone = 'Asia/Almaty';
      const timeString = appointmentDate.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone,
      });
      const dateString = appointmentDate.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone,
      });

      // Prepare notification content
      const title = 'Напоминание о записи';
      const appointmentType = appointment.isTelemedicine ? 'онлайн-консультация' : 'приём';
      // Jobs queued before the two-reminder change carry no `reminder` field
      const leadTime = reminder ? REMINDER_LEAD_TIME[reminder] : undefined;
      const message = leadTime
        ? `У вас ${appointmentType} ${leadTime} — ${dateString} в ${timeString}`
        : `У вас ${appointmentType} ${dateString} в ${timeString}`;

      const notificationData = {
        type: 'appointment_reminder',
        appointmentId: appointment.id,
        ...(reminder ? { reminder } : {}),
        dateTime: appointment.dateTime.toISOString(),
        isTelemedicine: appointment.isTelemedicine,
        ...(appointment.isTelemedicine && appointment.meetingUrl
          ? { meetingUrl: appointment.meetingUrl }
          : {}),
      };

      await sendPushNotification(appointment.userId, title, message, notificationData);

      jobLogger.info(
        {
          userId: appointment.userId,
          isTelemedicine: appointment.isTelemedicine,
          attempt: job.attemptsMade + 1,
          durationMs: Date.now() - startedAt,
        },
        'Appointment reminder sent'
      );
      return { success: true };
    } catch (error) {
      jobLogger.error(
        { err: error, attempt: job.attemptsMade + 1, durationMs: Date.now() - startedAt },
        'Failed to send appointment reminder'
      );
      throw error; // Will trigger retry logic
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  }
);

// Event handlers for monitoring
appointmentNotificationWorker.on('completed', (job) => {
  workerLogger.debug({ jobId: job.id }, 'Job completed');
});

appointmentNotificationWorker.on('failed', (job, err) => {
  workerLogger.error(
    { jobId: job?.id, attempt: job?.attemptsMade, attemptsLeft: job?.opts?.attempts, err },
    'Job failed'
  );
});

appointmentNotificationWorker.on('error', (err) => {
  workerLogger.error({ err }, 'Worker error');
});

export const startNotificationWorker = () => {
  workerLogger.info({ queue: 'appointment-notifications' }, 'Notification worker started');
  return appointmentNotificationWorker;
};

export const stopNotificationWorker = async () => {
  await appointmentNotificationWorker.close();
  workerLogger.info('Notification worker stopped');
};
