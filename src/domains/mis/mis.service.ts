import axios, { AxiosError } from 'axios';

import { config } from '@/config';
import { AppError } from '@/shared/services/app-error.service';
import { ErrorCodes } from '@/shared/constants/error-codes';

import {
  MISAppointmentResponse,
  FindPatientResponse,
  CreatePatientDto,
  CreateAppointmentDto,
  MISCreatePatientResponse,
} from './mis.dto';
import { availableSlotsMapper } from './helper';
import {
  MISFindPatientResponse,
  MISBranchesResponse,
  MISSpecializationsResponse,
  MISDoctorsResponse,
  MISDoctorDetailsResponse,
  MISDoctorAvailableSlotsResponse,
} from './mis.types';

const instance = axios.create({
  baseURL: config.mis.apiUrl,
});

export const findPatientByPhone = async (phone: string): Promise<FindPatientResponse> => {
  try {
    const response = await instance.post<MISFindPatientResponse>('/auth/beneficiary-login/', {
      phone_number: phone,
      otp_verified: true,
    });

    const [firstName, lastName, patronymic] = response.data.beneficiary.name.split(' ');

    return {
      id: response.data.beneficiary.id,
      firstName,
      lastName,
      patronymic,
      birthDate: response.data.beneficiary.birth_date,
      iin: response.data.beneficiary.iin,
      gender: response.data.beneficiary.gender === 0 ? 'M' : 'F',
    };
  } catch (error: unknown) {
    const axiosError = error as AxiosError;
    const errorMessage = (axiosError?.response?.data as { error: string })?.error;

    if (errorMessage) {
      throw new AppError(errorMessage, axiosError?.response?.status);
    }

    throw new AppError(ErrorCodes.MIS_PATIENT_NOT_FOUND, axiosError?.response?.status);
  }
};

export const createPatient = async (patient: CreatePatientDto) => {
  const name = [patient.lastName, patient.firstName, patient.patronymic].filter(Boolean).join(' ');

  try {
    const response = await instance.post<MISCreatePatientResponse>('/auth/beneficiary-create/', {
      phone_number: `8${patient.phoneNumber.slice(1)}`,
      otp_verified: true,
      name,
      gender: patient.gender === 'M' ? 0 : 1,
      birth_date: patient.birthDate,
      iin: patient.iin,
    });

    return response.data.beneficiary;
  } catch (error: unknown) {
    const axiosError = error as AxiosError;
    const errorMessage = (axiosError?.response?.data as { error: string })?.error;

    if (errorMessage) {
      throw new AppError(errorMessage, axiosError?.response?.status);
    }

    throw new AppError(ErrorCodes.MIS_PATIENT_NOT_FOUND, axiosError?.response?.status);
  }
};

export const getBranches = async () => {
  try {
    const response = await instance.get<MISBranchesResponse>('/beneficiary/branches/');
    return response.data.branches;
  } catch (error: unknown) {
    const axiosError = error as AxiosError;
    throw new AppError(ErrorCodes.MIS_PATIENT_NOT_FOUND, axiosError?.response?.status);
  }
};

export const getSpecializationsByBranchId = async (branchId: string) => {
  try {
    const response = await instance.get<MISSpecializationsResponse>(
      `/beneficiary/branches/${branchId}/specialties/`
    );
    return response.data.specialties;
  } catch (error: unknown) {
    const axiosError = error as AxiosError;
    throw new AppError(ErrorCodes.MIS_SPECIALTY_NOT_FOUND, axiosError?.response?.status);
  }
};

export const getDoctorsBySpecializationIdAndBranchId = async (
  specializationId: string,
  branchId: string
) => {
  try {
    const response = await instance.get<MISDoctorsResponse>(
      `/beneficiary/branches/${branchId}/specialties/${specializationId}/doctors/`
    );
    return response.data.doctors.map((doctor) => ({
      id: doctor.id,
      name: doctor.name,
      position: doctor.position,
      specialtyName: doctor.specialty_name,
      branchName: doctor.branch_name,
      appointmentDurationMinutes: doctor.appointment_duration_minutes,
    }));
  } catch (error: unknown) {
    const axiosError = error as AxiosError;
    throw new AppError(ErrorCodes.MIS_SPECIALTY_NOT_FOUND, axiosError?.response?.status);
  }
};

export const getDoctorDetailsById = async (doctorId: string) => {
  try {
    const response = await instance.get<MISDoctorDetailsResponse>(
      `/beneficiary/doctors/${doctorId}/`
    );
    return {
      id: response.data.doctor.id,
      name: response.data.doctor.name,
      specialty: response.data.doctor.specialty,
      branch: response.data.doctor.branch,
      position: response.data.doctor.position,
      appointmentDurationMinutes: response.data.doctor.appointment_duration_minutes,
      workPhone: response.data.doctor.work_phone,
      mobilePhone: response.data.doctor.mobile_phone,
    };
  } catch (error: unknown) {
    const axiosError = error as AxiosError;
    throw new AppError(ErrorCodes.MIS_SPECIALTY_NOT_FOUND, axiosError?.response?.status);
  }
};

export const getDoctorAvailableSlots = async (
  doctorId: string,
  startDate: string,
  endDate: string
) => {
  try {
    const response = await instance.get<MISDoctorAvailableSlotsResponse>(
      `/beneficiary/doctors/${doctorId}/available-slots/`,
      {
        params: {
          start_date: startDate,
          end_date: endDate,
        },
      }
    );
    return availableSlotsMapper(response.data.available_slots);
  } catch (error: unknown) {
    const axiosError = error as AxiosError;
    throw new AppError(ErrorCodes.MIS_SPECIALTY_NOT_FOUND, axiosError?.response?.status);
  }
};

export const createAppointment = async (newAppointment: CreateAppointmentDto) => {
  try {
    const response = await instance.post<MISDoctorAvailableSlotsResponse>(
      `/beneficiary/appointments/create/`,
      {
        doctor: newAppointment.doctorId,
        beneficiary: newAppointment.patientId,
        start_time: newAppointment.startTime,
        end_time: newAppointment.endTime,
        record_type: 'paid',
        appointment_type: 'primary',
        notes: '',
        branch: newAppointment.branchId,
      }
    );
    return response.data;
  } catch (error: unknown) {
    const axiosError = error as AxiosError;
    const errorMessage = (axiosError?.response?.data as { error: string })?.error;

    if (errorMessage) {
      throw new AppError(errorMessage, axiosError?.response?.status);
    }

    throw new AppError(ErrorCodes.MIS_CREATE_APPOINTMENT_FAILED, axiosError?.response?.status);
  }
};

export const getAppointments = async (misPatientId: string) => {
  try {
    const response = await instance.get<MISAppointmentResponse>(
      `/beneficiary/${misPatientId}/appointments/`
    );
    return response.data.appointments;
  } catch (error: unknown) {
    const axiosError = error as AxiosError;
    const errorMessage = (axiosError?.response?.data as { error: string })?.error;

    if (errorMessage) {
      throw new AppError(errorMessage, axiosError?.response?.status);
    }

    throw new AppError(ErrorCodes.MIS_CREATE_APPOINTMENT_FAILED, axiosError?.response?.status);
  }
};

export const removeAppointment = async (misPatientId: string, appointmentId: string) => {
  try {
    const response = await instance.delete(
      `/beneficiary/${misPatientId}/appointments/${appointmentId}`
    );
    return response.data;
  } catch (error: unknown) {
    const axiosError = error as AxiosError;
    const errorMessage = (axiosError?.response?.data as { error: string })?.error;

    if (errorMessage) {
      throw new AppError(errorMessage, axiosError?.response?.status);
    }

    throw new AppError(ErrorCodes.MIS_CREATE_APPOINTMENT_FAILED, axiosError?.response?.status);
  }
};
