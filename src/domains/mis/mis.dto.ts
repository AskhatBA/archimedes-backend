import { Gender } from '@/shared/types/gender';

export interface FindPatientResponse {
  id: string;
  firstName: string;
  lastName: string;
  patronymic?: string;
  birthDate: string;
  gender: Gender;
  iin: string;
}

export interface CreatePatientDto {
  phoneNumber: string;
  firstName: string;
  lastName: string;
  patronymic?: string;
  gender: Gender;
  birthDate: string;
  iin: string;
}

export interface CreateAppointmentDto {
  doctorId: string;
  patientId: string;
  startTime: string;
  endTime: string;
  branchId: string;
}
