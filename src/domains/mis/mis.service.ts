import { getPatientById } from '@/domains/patient/patient.service';
import { isDevelopment } from '@/config';

import {
  MISAppointmentResponse,
  FindPatientResponse,
  CreatePatientDto,
  CreateAppointmentDto,
  MISCreatePatientResponse,
  MISFindPatientResponse,
} from './mis.dto';
import { availableSlotsMapper, parsePatientFullName, misRequest } from './mis.helpers';
import {
  MIS_API_GET_USER_BY_PHONE,
  MIS_API_GET_USER_PROFILE_BY_ID,
  MIS_API_BRANCH_LIST,
  MIS_API_CREATE_USER,
  MIS_API_GET_SPECIALIZATION_BY_BRANCH_ID,
  MIS_API_GET_DOCTOR_LIST,
  MIS_API_GET_DOCTOR_BY_ID,
  MIS_API_GET_DOCTOR_AVAILABLE_SLOTS,
  MIS_API_CREATE_APPOINTMENT,
  MIS_API_GET_USER_APPOINTMENTS,
} from './mis.constants';
import {
  MISBranchesResponse,
  MISSpecializationsResponse,
  MISDoctorsResponse,
  MISDoctorDetailsResponse,
  MISDoctorAvailableSlotsResponse,
  MISPatientBeneficiary,
} from './mis.types';

export const getUserInsuranceDetails = async (userId: string, phone: string) => {
  const patient = await getPatientById(userId);
  if (!patient) return;

  const misPatient = await findPatientByIinAndPhone(patient.iin, phone);
  if (!misPatient) return;

  const misPatientProfile = await misRequest<MISFindPatientResponse>({
    resolverName: MIS_API_GET_USER_PROFILE_BY_ID,
    params: {
      userId: misPatient.id,
    },
  });

  if (isDevelopment) {
    return {
      beneficiaryId: 'DF1D02E8-B664-435E-844E-6D90CF1F37DC',
    };
  }

  return {
    beneficiaryId: misPatientProfile?.profile?.insurance?.beneficiary_external_id || misPatient?.id,
  };
};

export const findPatientByIinAndPhone = async (
  iin: string,
  phone: string
): Promise<FindPatientResponse | undefined> => {
  const misPatientDetail = await misRequest<MISFindPatientResponse>({
    resolverName: MIS_API_GET_USER_BY_PHONE,
    payload: {
      phone_number: phone,
    },
  });
  if (!misPatientDetail) return;

  const isMultipleBeneficiaries =
    !!misPatientDetail.beneficiarys && !!misPatientDetail.beneficiarys.length;
  let currentBeneficiary: MISPatientBeneficiary | undefined = undefined;

  if (isMultipleBeneficiaries) {
    currentBeneficiary = misPatientDetail.beneficiarys?.find(
      (beneficiary) => beneficiary.iin === iin
    );
  } else {
    currentBeneficiary = misPatientDetail.beneficiary;
  }

  if (!currentBeneficiary) return;

  const { firstName, lastName, patronymic } = parsePatientFullName(currentBeneficiary.name);

  return {
    id: currentBeneficiary.id || '',
    firstName,
    lastName,
    patronymic,
    birthDate: currentBeneficiary.birth_date || '',
    iin: currentBeneficiary.iin || '',
    gender: currentBeneficiary.gender === 0 ? 'M' : 'F',
  };
};

export const createPatient = async (patient: CreatePatientDto) => {
  const name = [patient.lastName, patient.firstName, patient.patronymic].filter(Boolean).join(' ');

  const response = await misRequest<MISCreatePatientResponse>({
    resolverName: MIS_API_CREATE_USER,
    payload: {
      phone_number: `8${patient.phoneNumber.slice(1)}`,
      otp_verified: true,
      name,
      gender: patient.gender === 'M' ? 0 : 1,
      birth_date: patient.birthDate,
      iin: patient.iin,
    },
  });

  return response.beneficiary;
};

export const getBranches = async () => {
  const response = await misRequest<MISBranchesResponse>({ resolverName: MIS_API_BRANCH_LIST });
  return response.branches;
};

export const getSpecializationsByBranchId = async (branchId: string) => {
  const response = await misRequest<MISSpecializationsResponse>({
    resolverName: MIS_API_GET_SPECIALIZATION_BY_BRANCH_ID,
    params: { branchId },
  });

  return response.specialties;
};

export const getDoctorsBySpecializationIdAndBranchId = async (
  specializationId: string,
  branchId: string
) => {
  const response = await misRequest<MISDoctorsResponse>({
    resolverName: MIS_API_GET_DOCTOR_LIST,
    params: { branchId, specializationId },
  });

  return response.doctors.map((doctor) => ({
    id: doctor.id,
    name: doctor.name,
    position: doctor.position,
    specialtyName: doctor.specialty_name,
    branchName: doctor.branch_name,
    appointmentDurationMinutes: doctor.appointment_duration_minutes,
  }));
};

export const getDoctorDetailsById = async (doctorId: string) => {
  const response = await misRequest<MISDoctorDetailsResponse>({
    resolverName: MIS_API_GET_DOCTOR_BY_ID,
    params: { doctorId },
  });

  return {
    id: response.doctor.id,
    name: response.doctor.name,
    specialty: response.doctor.specialty,
    branch: response.doctor.branch,
    position: response.doctor.position,
    appointmentDurationMinutes: response.doctor.appointment_duration_minutes,
    workPhone: response.doctor.work_phone,
    mobilePhone: response.doctor.mobile_phone,
  };
};

export const getDoctorAvailableSlots = async (
  doctorId: string,
  startDate: string,
  endDate: string
) => {
  const response = await misRequest<MISDoctorAvailableSlotsResponse>({
    resolverName: MIS_API_GET_DOCTOR_AVAILABLE_SLOTS,
    params: { doctorId },
    query: { start_date: startDate, end_date: endDate },
  });

  return availableSlotsMapper(response.available_slots);
};

export const createAppointment = async (newAppointment: CreateAppointmentDto) => {
  return misRequest<MISDoctorAvailableSlotsResponse>({
    resolverName: MIS_API_CREATE_APPOINTMENT,
    payload: {
      doctor: newAppointment.doctorId,
      beneficiary: newAppointment.patientId,
      start_time: newAppointment.startTime,
      end_time: newAppointment.endTime,
      branch: newAppointment.branchId,
      insurance: newAppointment.insuranceProgramId,
    },
  });
};

export const getAppointments = async (misPatientId: string) => {
  const response = await misRequest<MISAppointmentResponse>({
    resolverName: MIS_API_GET_USER_APPOINTMENTS,
    params: { userId: misPatientId },
  });

  return response.appointments;
};

export const removeAppointment = async (misPatientId: string, appointmentId: string) => {
  return misRequest({
    resolverName: MIS_API_GET_USER_APPOINTMENTS,
    params: { userId: misPatientId, appointmentId },
  });
};
