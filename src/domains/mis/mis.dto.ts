import { Gender } from '@/shared/types/gender';

import { MISAppointment } from './mis.types';

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

export interface MISAppointmentResponse {
  status: string;
  beneficiary_id: string;
  count: 1;
  appointments: MISAppointment[];
}

export interface MISCreatePatientResponse {
  status: string;
  message: string;
  beneficiary: {
    id: string;
    name: string;
    gender: 0;
    iin: string;
    birth_date: string;
    phone_number: string;
    address: string;
    address_details: string;
  };
}
