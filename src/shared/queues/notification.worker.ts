import { Worker, Job } from 'bullmq';

import { redisConnection } from '@/infrastructure/redis';
import * as db from '@/infrastructure/db';
import { sendPushNotification } from '@/domains/notifications/notifications.service';

import { AppointmentNotificationJobData } from './notification.queue';

export const appointmentNotificationWorker = new Worker<AppointmentNotificationJobData>(
  'appointment-notifications',
  async (job: Job<AppointmentNotificationJobData>) => {
    const { appointmentId } = job.data;

    try {
      // Fetch appointment details
      const appointment = await db.prismaClient.appointment.findUnique({
        where: { id: appointmentId },
      });

      if (!appointment) {
        console.warn(`Appointment ${appointmentId} not found. Skipping notification.`);
        return { success: false, reason: 'Appointment not found' };
      }

      // Only send notification for scheduled appointments
      if (appointment.status !== 'SCHEDULED') {
        console.log(
          `Appointment ${appointmentId} is not scheduled (status: ${appointment.status}). Skipping notification.`
        );
        return { success: false, reason: 'Appointment not scheduled' };
      }

      // Format date and time
      const appointmentDate = new Date(appointment.dateTime);
      const timeString = appointmentDate.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const dateString = appointmentDate.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      // Prepare notification content
      const title = 'Напоминание о записи';
      const appointmentType = appointment.isTelemedicine ? 'онлайн-консультация' : 'приём';
      const message = `У вас ${appointmentType} ${dateString} в ${timeString}`;

      const notificationData = {
        type: 'appointment_reminder',
        appointmentId: appointment.id,
        dateTime: appointment.dateTime.toISOString(),
        isTelemedicine: appointment.isTelemedicine,
        ...(appointment.isTelemedicine && appointment.meetingUrl
          ? { meetingUrl: appointment.meetingUrl }
          : {}),
      };

      await sendPushNotification(appointment.userId, title, message, notificationData);

      console.log(`Appointment reminder sent successfully for appointment ${appointmentId}`);
      return { success: true };
    } catch (error) {
      console.error(`Error sending appointment reminder for ${appointmentId}:`, error);
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
  console.log(`Job ${job.id} completed successfully`);
});

appointmentNotificationWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed with error:`, err);
});

appointmentNotificationWorker.on('error', (err) => {
  console.error('Worker error:', err);
});

export const startNotificationWorker = () => {
  console.log('Appointment notification worker started');
  return appointmentNotificationWorker;
};

export const stopNotificationWorker = async () => {
  await appointmentNotificationWorker.close();
  console.log('Appointment notification worker stopped');
};
