import { Queue } from 'bullmq';

import { config } from '@/config';
import { redisConnection } from '@/infrastructure/redis';
import { createLogger } from '@/shared/lib/logger';

const queueLogger = createLogger('notification-queue');

export type AppointmentReminderKey = '3h' | '1h';

export interface AppointmentNotificationJobData {
  appointmentId: string;
  patientId: string;
  dateTime: Date;
  reminder: AppointmentReminderKey;
  offsetMinutes: number;
}

interface ReminderDefinition {
  key: AppointmentReminderKey;
  offsetMinutes: number;
  // Delay used instead of the real offset when NOTIFICATION_TEST_MODE is on
  testDelaySeconds: number;
}

export const APPOINTMENT_REMINDERS: ReminderDefinition[] = [
  { key: '3h', offsetMinutes: 180, testDelaySeconds: 30 },
  { key: '1h', offsetMinutes: 60, testDelaySeconds: 60 },
];

const reminderJobId = (appointmentId: string, key: AppointmentReminderKey) =>
  `appointment-${appointmentId}-${key}`;

// Job ID used by the previous single (10 minutes before) reminder — still removed
// on cancel/reschedule so jobs queued before this change don't fire.
const legacyReminderJobId = (appointmentId: string) => `appointment-${appointmentId}`;

export const appointmentNotificationQueue = new Queue<AppointmentNotificationJobData>(
  'appointment-notifications',
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
      },
    },
  }
);

export const scheduleAppointmentNotification = async (
  appointmentId: string,
  patientId: string,
  dateTime: Date
) => {
  // For testing: send reminders 30s / 60s after appointment creation
  // For production: send reminders 3 hours and 1 hour before the appointment
  const useTestDelay = config.notifications.testMode;

  for (const { key, offsetMinutes, testDelaySeconds } of APPOINTMENT_REMINDERS) {
    const notificationTime = useTestDelay
      ? new Date(Date.now() + testDelaySeconds * 1000)
      : new Date(dateTime.getTime() - offsetMinutes * 60 * 1000);

    const delay = notificationTime.getTime() - Date.now();

    const jobId = reminderJobId(appointmentId, key);
    const logContext = {
      jobId,
      appointmentId,
      reminder: key,
      appointmentAt: dateTime,
      scheduledFor: notificationTime,
      delayMs: delay,
      testMode: useTestDelay,
    };

    // Only schedule if notification time is in the future
    if (delay <= 0) {
      queueLogger.info(
        logContext,
        'Appointment reminder skipped: notification time is in the past'
      );
      continue;
    }

    await appointmentNotificationQueue.add(
      'send-appointment-reminder',
      {
        appointmentId,
        patientId,
        dateTime,
        reminder: key,
        offsetMinutes,
      },
      {
        delay,
        jobId, // Unique job ID to prevent duplicates
      }
    );

    queueLogger.info(logContext, 'Appointment reminder scheduled');
  }
};

export const cancelAppointmentNotification = async (appointmentId: string) => {
  const jobIds = [
    ...APPOINTMENT_REMINDERS.map(({ key }) => reminderJobId(appointmentId, key)),
    legacyReminderJobId(appointmentId),
  ];

  for (const jobId of jobIds) {
    const job = await appointmentNotificationQueue.getJob(jobId);

    if (job) {
      await job.remove();
      queueLogger.info({ jobId, appointmentId }, 'Appointment reminder cancelled');
      continue;
    }

    queueLogger.debug({ jobId, appointmentId }, 'No scheduled reminder to cancel');
  }
};

export const rescheduleAppointmentNotification = async (
  appointmentId: string,
  patientId: string,
  newDateTime: Date
) => {
  // Remove existing notifications
  await cancelAppointmentNotification(appointmentId);

  // Schedule new notifications
  await scheduleAppointmentNotification(appointmentId, patientId, newDateTime);
};
