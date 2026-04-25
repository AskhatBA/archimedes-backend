import { Queue } from 'bullmq';

import { redisConnection } from '@/infrastructure/redis';

export interface AppointmentNotificationJobData {
  appointmentId: string;
  patientId: string;
  dateTime: Date;
}

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
  // For testing: send notification 30 seconds after appointment creation
  // For production: send notification 10 minutes before appointment
  const USE_TEST_DELAY = process.env.NOTIFICATION_TEST_MODE === 'true';

  const notificationTime = USE_TEST_DELAY
    ? new Date(Date.now() + 30 * 1000) // 30 seconds from now for testing
    : new Date(dateTime.getTime() - 10 * 60 * 1000); // 10 minutes before appointment

  const delay = notificationTime.getTime() - Date.now();

  console.log(`[Notification] Scheduling for appointment ${appointmentId}`);
  console.log(`[Notification] Appointment time: ${dateTime}`);
  console.log(`[Notification] Will send at: ${notificationTime}`);
  console.log(`[Notification] Delay: ${delay}ms (${Math.round(delay / 1000)}s)`);
  console.log(`[Notification] Test mode: ${USE_TEST_DELAY}`);

  // Only schedule if notification time is in the future
  if (delay > 0) {
    await appointmentNotificationQueue.add(
      'send-appointment-reminder',
      {
        appointmentId,
        patientId,
        dateTime,
      },
      {
        delay,
        jobId: `appointment-${appointmentId}`, // Unique job ID to prevent duplicates
      }
    );
  }
};

export const cancelAppointmentNotification = async (appointmentId: string) => {
  const jobId = `appointment-${appointmentId}`;
  const job = await appointmentNotificationQueue.getJob(jobId);

  if (job) {
    await job.remove();
  }
};

export const rescheduleAppointmentNotification = async (
  appointmentId: string,
  patientId: string,
  newDateTime: Date
) => {
  // Remove existing notification
  await cancelAppointmentNotification(appointmentId);

  // Schedule new notification
  await scheduleAppointmentNotification(appointmentId, patientId, newDateTime);
};
