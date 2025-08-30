export interface MISFindPatientResponse {
  status: string;
  message: string;
  beneficiary: {
    id: string;
    name: string;
    phone_number: string;
    gender: 0 | 1;
    iin: string;
    birth_date: string;
    address: string;
    address_details: string;
  };
  access_token: string;
  token_type: string;
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
}
