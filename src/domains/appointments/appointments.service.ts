import { AppointmentStatus, Role } from '@prisma/client';

import * as db from '@/infrastructure/db';

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

export const createAppointment = (data: {
  patientId: string;
  doctorId: string;
  externalId: string;
  dateTime: Date;
  notes: string;
  status?: AppointmentStatus;
  meetingUrl?: string;
  isTelemedicine?: boolean;
}) => {
  return db.prismaClient.appointment.create({
    data: {
      patientId: data.patientId,
      doctorId: data.doctorId,
      externalId: data.externalId,
      dateTime: data.dateTime,
      notes: data.notes,
      status: data.status || AppointmentStatus.SCHEDULED,
      isTelemedicine: data.isTelemedicine || false,
      meetingUrl: data.meetingUrl || '',
    },
  });
};

export const updateAppointment = (
  id: string,
  userId: string,
  role: Role,
  data: {
    dateTime?: Date;
    status?: AppointmentStatus;
    notes?: string;
  }
) => {
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

  return db.prismaClient.appointment.updateMany({
    where: whereClause,
    data: {
      ...(data.dateTime && { dateTime: data.dateTime }),
      ...(data.status && { status: data.status }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  });
};

export const deleteAppointment = (id: string, userId: string, role: Role) => {
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

  return db.prismaClient.appointment.deleteMany({
    where: whereClause,
  });
};

export const cancelAppointment = (id: string, userId: string, role: Role) => {
  return updateAppointment(id, userId, role, { status: AppointmentStatus.CANCELLED });
};
