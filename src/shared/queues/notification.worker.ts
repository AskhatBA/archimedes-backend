import { Worker, Job } from 'bullmq';

import { redisConnection } from '@/infrastructure/redis';
import * as db from '@/infrastructure/db';
import { sendPushNotification } from '@/domains/notifications/notifications.service';
import { createLogger } from '@/shared/lib/logger';

import { AppointmentNotificationJobData, AppointmentReminderKey } from './notification.queue';

const workerLogger = createLogger('notification-worker');

// User's local zone (Asia/Almaty, UTC+5)
const TIME_ZONE = 'Asia/Almaty';

// YYYY-MM-DD as seen in TIME_ZONE — used to say "сегодня"/"завтра" instead of a date
const zonedDayKey = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const daysUntil = (date: Date) => {
  const day = Date.parse(`${zonedDayKey(date)}T00:00:00Z`);
  const today = Date.parse(`${zonedDayKey(new Date())}T00:00:00Z`);

  return Math.round((day - today) / (24 * 60 * 60 * 1000));
};

// "сегодня в 14:30" / "завтра в 09:00" / "6 августа в 09:00"
const formatWhen = (date: Date) => {
  const time = date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  });

  const dayOffset = daysUntil(date);

  if (dayOffset === 0) return `сегодня в ${time}`;
  if (dayOffset === 1) return `завтра в ${time}`;

  const day = date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: TIME_ZONE,
  });

  return `${day} в ${time}`;
};

const REMINDER_TITLES: Record<AppointmentReminderKey, { visit: string; online: string }> = {
  '3h': { visit: 'Приём через 3 часа', online: 'Онлайн-консультация через 3 часа' },
  '1h': { visit: 'Приём через час', online: 'Онлайн-консультация через час' },
};

// Second line: what the patient should do now. Differs by reminder — three hours
// out it's about preparing, an hour out it's about being on time.
const REMINDER_HINTS: Record<AppointmentReminderKey, { visit: string; online: string }> = {
  '3h': {
    visit: 'Возьмите с собой удостоверение личности.',
    online: 'Консультация пройдёт в приложении — проверьте связь заранее.',
  },
  '1h': {
    visit: 'Лучше прийти за 10–15 минут до начала.',
    online: 'Подключайтесь из приложения за пару минут до начала.',
  },
};

const buildReminderContent = (
  reminder: AppointmentReminderKey | undefined,
  isTelemedicine: boolean,
  when: string
) => {
  const kind = isTelemedicine ? 'online' : 'visit';

  // Jobs queued before the two-reminder change carry no `reminder` field
  if (!reminder) {
    const appointmentType = isTelemedicine ? 'Онлайн-консультация' : 'Приём';

    return { title: 'Напоминание о записи', message: `${appointmentType} ${when}.` };
  }

  return {
    title: REMINDER_TITLES[reminder][kind],
    message: `${when.charAt(0).toUpperCase()}${when.slice(1)}. ${REMINDER_HINTS[reminder][kind]}`,
  };
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

      const when = formatWhen(new Date(appointment.dateTime));
      const { title, message } = buildReminderContent(reminder, appointment.isTelemedicine, when);

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
