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
  externalId: string;
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
  userId: string;
  doctorId: string;
  patientId: string;
  startTime: string;
  endTime: string;
  branchId: string;
  /** Absent for a patient without a programme — the visit is paid for per booking. */
  insuranceProgramId?: string;
  familyMemberId?: string;
  isTelemedicine?: boolean;
  /**
   * `oid` of the doctor's service from `GET /insurance/medic-service`, sent to MIS as
   * `booked_service`. Optional because app builds released before it was added do not send it.
   */
  medicServiceOid?: string;
  /** Платёж, которым оплачен визит. Только для приёма без программы. */
  paymentId?: string;
}

export interface MISAppointmentResponse {
  status: string;
  beneficiary_id: string;
  count: 1;
  appointments: MISAppointment[];
}

export interface MISAppointmentDetails {
  id: string;
  doctor_name: string;
  beneficiary_name: string;
  branch_name: string;
  start_time: string;
  end_time: string;
  status: string;
  status_display: string;
  record_type: string;
  record_type_display: string;
  appointment_type: string;
  appointment_type_display: string;
  notes: string;
}

export interface MISAppointmentCreateResponse {
  status: string;
  message: string;
  request?: MISAppointmentDetails;
  appointment?: MISAppointmentDetails & {
    meeting_id: string;
    meeting_join_url: string;
    meeting_start_url: string;
  };
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
