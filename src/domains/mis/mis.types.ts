import { misApiResolvers } from '@/domains/mis/mis.constants';

export interface MISPatientBeneficiary {
  id: string;
  name: string;
  phone_number: string;
  gender: 0 | 1;
  iin: string;
  birth_date: string;
  address: string;
  address_details: string;
  profile: {
    insurance: MISInsuranceInfo;
  };
}

export interface MISBranch {
  id: string;
  name: string;
  address: string;
}

export interface MISBranchesResponse {
  status: string;
  count: number;
  branches: MISBranch[];
}

export interface MISSpecialization {
  id: string;
  name: string;
}

export interface MISSpecializationsResponse {
  status: string;
  count: number;
  specialties: MISSpecialization[];
}

export interface MISDoctor {
  id: string;
  name: string;
  specialty_name: string;
  branch_name: string;
  position: string;
  appointment_duration_minutes: number;
}

export interface MISDoctorsResponse {
  status: string;
  branch_id: string;
  specialty_id: string;
  count: number;
  doctors: MISDoctor[];
}

export interface MISDoctorDetails {
  id: string;
  name: string;
  specialty: MISSpecialization;
  branch: MISBranch;
  position: string;
  appointment_duration_minutes: number;
  work_phone: string;
  mobile_phone: string;
}

export interface MISDoctorDetailsResponse {
  status: string;
  doctor: MISDoctorDetails;
}

export interface MISDoctorAvailableSlotValue {
  date: string;
  time_slots: [
    {
      start_time: string;
      end_time: string;
      available: boolean;
    },
    {
      start_time: string;
      end_time: string;
      available: boolean;
    },
  ];
}

export type MISDoctorAvailableSlot = Record<string, MISDoctorAvailableSlotValue>;

export interface MISDoctorAvailableSlotsResponse {
  status: string;
  doctor_id: string;
  end_date: string;
  start_date: string;
  available_slots: MISDoctorAvailableSlot;
}

export interface MappedAvailableSlots {
  [key: string]: {
    date: string;
    timeSlots: {
      startTime: string;
      endTime: string;
      available: boolean;
    }[];
  };
}

export interface MISAppointment {
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
  meeting_id: string;
  meeting_join_url: string;
  meeting_start_url: string;
}

export interface MISAppointmentDetailsResponse {
  status: string;
  appointment: MISAppointment;
}

export interface MISInsuranceInfo {
  beneficiary_external_id: string | null;
  card_number: string;
  customer_name: string;
}

export interface MISOptions {
  useDev?: boolean;
}

export interface MisRequestPayload {
  resolverName: keyof typeof misApiResolvers;
  payload?: any;
  params?: any;
  query?: any;
  options?: MISOptions;
}

export interface MISDocument {
  id: string;
  document_type_name: string;
  file_url: string;
  status: string;
  created_at: string;
}

export interface MISAppointmentHistory {
  id: string;
  doctor: MISDoctor;
  actual_start_time: string;
  diagnosis: null;
  documents: MISDocument[];
  template_type: string;
  appointment_type: string;
  appointment_type_display: string;
}

export interface MISLaboratoryResult {
  reg_date: string;
  number: string;
  patient_full_name: string;
  birthdate: string;
  pdf_base64: string;
  department_name: string;
  biomaterial_name: string;
}
