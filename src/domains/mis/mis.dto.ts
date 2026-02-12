import { Gender } from '@/shared/types/gender';

import { MISAppointment, MISInsuranceInfo, MISPatientBeneficiary } from './mis.types';

export type FindPatientResponse = {
  id: string;
  firstName: string;
  lastName: string;
  patronymic?: string;
  birthDate: string;
  gender: Gender;
  iin: string;
};

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
  insuranceProgramId: string;
  familyMemberId?: string;
  isTelemedicine?: boolean;
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

export interface MISFindPatientResponse {
  status: string;
  message: string;
  beneficiary?: MISPatientBeneficiary;
  beneficiarys?: MISPatientBeneficiary[];
  access_token: string;
  token_type: string;
  profile: {
    insurance: MISInsuranceInfo;
  };
}
