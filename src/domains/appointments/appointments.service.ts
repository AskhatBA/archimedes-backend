import { AppointmentStatus, Role } from '@prisma/client';

import * as db from '@/infrastructure/db';
import {
  scheduleAppointmentNotification,
  cancelAppointmentNotification,
  rescheduleAppointmentNotification,
} from '@/shared/queues/notification.queue';

export const getAllAppointments = (userId: string) => {
  return db.prismaClient.appointment.findMany({
    where: { patientId: userId },
    orderBy: {
      dateTime: 'desc',
    },
  });
};

export const getAppointmentById = (id: string, userId: string) => {
  return db.prismaClient.appointment.findFirst({
    where: {
      id,
      patientId: userId,
    },
  });
};

export const createAppointment = async (data: {
  userId: string;
  patientId: string;
  doctorId: string;
  externalId: string;
  dateTime: Date;
  notes: string;
  status?: AppointmentStatus;
  meetingUrl?: string;
  isTelemedicine?: boolean;
}) => {
  const appointment = await db.prismaClient.appointment.create({
    data: {
      patientId: data.patientId,
      doctorId: data.doctorId,
      externalId: data.externalId,
      dateTime: data.dateTime,
      notes: data.notes,
      status: data.status || AppointmentStatus.SCHEDULED,
      isTelemedicine: data.isTelemedicine || false,
      meetingUrl: data.meetingUrl || '',
      userId: data.userId,
    },
  });

  // Schedule notification 10 minutes before appointment
  if (appointment.status === AppointmentStatus.SCHEDULED) {
    await scheduleAppointmentNotification(
      appointment.id,
      appointment.userId,
      appointment.dateTime
    ).catch((error) => {
      console.error('Failed to schedule appointment notification:', error);
      // Don't fail the appointment creation if notification scheduling fails
    });
  }

  return appointment;
};

export const updateAppointment = async (
  id: string,
  userId: string,
  data: {
    dateTime?: Date;
    status?: AppointmentStatus;
    notes?: string;
  }
) => {
  // Get appointment before update to check if we need to reschedule notification
  const existingAppointment = await db.prismaClient.appointment.findFirst({
    where: { id, userId },
  });

  const result = await db.prismaClient.appointment.updateMany({
    where: { id, userId },
    data: {
      ...(data.dateTime && { dateTime: data.dateTime }),
      ...(data.status && { status: data.status }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  });

  // Handle notification rescheduling/cancellation if appointment was updated
  if (result.count > 0 && existingAppointment) {
    try {
      // If appointment was cancelled or completed, cancel notification
      if (
        data.status === AppointmentStatus.CANCELLED ||
        data.status === AppointmentStatus.COMPLETED
      ) {
        await cancelAppointmentNotification(id);
      }
      // If date/time changed and appointment is still scheduled, reschedule notification
      else if (data.dateTime && (!data.status || data.status === AppointmentStatus.SCHEDULED)) {
        await rescheduleAppointmentNotification(id, existingAppointment.userId, data.dateTime);
      }
      // If status changed to scheduled (e.g., from cancelled), schedule notification
      else if (
        data.status === AppointmentStatus.SCHEDULED &&
        existingAppointment.status !== AppointmentStatus.SCHEDULED
      ) {
        await scheduleAppointmentNotification(
          id,
          existingAppointment.userId,
          data.dateTime || existingAppointment.dateTime
        );
      }
    } catch (error) {
      console.error('Failed to update appointment notification:', error);
      // Don't fail the appointment update if notification update fails
    }
  }

  return result;
};

export const deleteAppointment = async (id: string, userId: string, role: Role) => {
  const whereClause =
    role === Role.PATIENT
      ? {
          id: id,
          patient: {
            userId: userId,
          },
        }
      : {
          id: id,
          doctor: {
            userId: userId,
          },
        };

  const result = await db.prismaClient.appointment.deleteMany({
    where: whereClause,
  });

  // Cancel notification if appointment was deleted
  if (result.count > 0) {
    await cancelAppointmentNotification(id).catch((error) => {
      console.error('Failed to cancel appointment notification:', error);
    });
  }

  return result;
};

export const cancelAppointment = (id: string, userId: string) => {
  return updateAppointment(id, userId, { status: AppointmentStatus.CANCELLED });
};
