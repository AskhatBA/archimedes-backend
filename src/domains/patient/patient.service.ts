import * as db from '@/infrastructure/db';

import { PatientDto } from './patient.dto';

export const getPatientById = (userId: string) => {
  return db.prismaClient.patient.findUnique({
    where: { userId: userId },
  });
};

export const createPatient = (patient: PatientDto) => {
  return db.prismaClient.patient.create({
    data: {
      userId: patient.userId,
      fullName: `${patient.firstName} ${patient.lastName}`,
      lastName: patient.lastName,
      firstName: patient.firstName,
      patronymic: patient.patronymic || '',
      gender: patient.gender,
      birthDate: patient.birthDate,
      iin: patient.iin,
      misPatientId: patient.misPatientId,
    },
  });
};
