import { Patient } from '@prisma/client';

export interface PatientDto {
  userId: Patient['userId'];
  gender: Patient['gender'];
  birthDate: Patient['birthDate'];
  firstName: Patient['firstName'];
  patronymic?: Patient['patronymic'];
  lastName: Patient['lastName'];
}
