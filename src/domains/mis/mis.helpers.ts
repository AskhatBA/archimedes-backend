import axios, { AxiosError } from 'axios';

import { ErrorCodes } from '@/shared/constants/error-codes';
import { config } from '@/config';
import { AppError } from '@/shared/services/app-error.service';
import { resolveApiUrlParams } from '@/shared/helpers/resolve-api-url-params';

import {
  MISDoctorAvailableSlot,
  MappedAvailableSlots,
  MisRequestPayload,
  MISAppointmentHistory,
  MISLaboratoryResult,
} from './mis.types';
import { misApiResolvers } from './mis.constants';

export const availableSlotsMapper = (slots: MISDoctorAvailableSlot) => {
  return Object.entries(slots).reduce((result: MappedAvailableSlots, slot) => {
    const [key, value] = slot;

    result[key] = {
      date: value.date,
      timeSlots: value.time_slots.map((timeSlot) => ({
        startTime: timeSlot.start_time,
        endTime: timeSlot.end_time,
        available: timeSlot.available,
      })),
    };

    return result;
  }, {});
};

export const parsePatientFullName = (fullName: string) => {
  const [firstName, lastName, patronymic] = fullName.split(' ');
  return { firstName, lastName, patronymic };
};

export const parseApiError = (
  error: unknown,
  defaultErrorMessage: keyof typeof ErrorCodes = ErrorCodes.UNKNOWN_ERROR
) => {
  const axiosError = error as AxiosError;
  const errorData = axiosError?.response?.data as {
    error: string;
    errors: Record<string, string | string[]>;
  };
  const errorMessage = errorData?.errors
    ? Object.values(errorData.errors).join('; ')
    : errorData?.error || defaultErrorMessage;

  return {
    message: errorMessage,
    status:
      !axiosError?.response?.status || axiosError?.response?.status === 401
        ? 404
        : axiosError?.response?.status,
  };
};

const misHttp = axios.create({
  baseURL: config.mis.apiUrl,
});

export const misRequest = async <T>({
  resolverName,
  payload = {},
  params = {},
  query = {},
  options = {},
}: MisRequestPayload) => {
  try {
    const apiResolver = misApiResolvers[resolverName as keyof typeof misApiResolvers];
    const response = await misHttp.request<T>({
      baseURL: options?.useDev ? config.mis.devApiUrl : config.mis.apiUrl,
      method: apiResolver.method,
      url: resolveApiUrlParams(resolverName, params),
      data: {
        ...apiResolver.defaultPayload,
        ...payload,
      },
      params: query,
    });
    return response.data;
  } catch (error: unknown) {
    const errorData = parseApiError(error);
    throw new AppError(errorData.message, errorData.status);
  }
};

export const mapAppointmentHistory = (appointmentHistory: MISAppointmentHistory[]) => {
  return appointmentHistory.map((appointment) => ({
    id: appointment.id,
    doctor: {
      id: appointment.doctor.id,
      name: appointment.doctor.name,
      specialtyName: appointment.doctor.specialty_name,
      branchName: appointment.doctor.branch_name,
      position: appointment.doctor.position,
      appointmentDurationMinutes: appointment.doctor.appointment_duration_minutes,
    },
    actualStartTime: appointment.actual_start_time,
    diagnosis: appointment.diagnosis,
    documents: appointment.documents.map((document) => ({
      id: document.id,
      documentTypeName: document.document_type_name,
      fileUrl: document.file_url,
      status: document.status,
      createdAt: document.created_at,
    })),
    templateType: appointment.template_type,
    appointmentType: appointment.appointment_type,
    appointmentTypeDisplay: appointment.appointment_type_display,
  }));
};

export const mapLaboratoryResults = (results: MISLaboratoryResult[]) => {
  return results.map((result) => ({
    registrationDate: result.reg_date,
    number: result.number,
    patientFullName: result.patient_full_name,
    birthDate: result.birthdate,
    pdfBase64: result.pdf_base64,
    departmentName: result.department_name,
    biomaterialName: result.biomaterial_name,
  }));
};
