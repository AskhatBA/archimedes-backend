import axios, { AxiosError } from 'axios';

import { ErrorCodes } from '@/shared/constants/error-codes';
import { config } from '@/config';
import { AppError } from '@/shared/services/app-error.service';

import { MISDoctorAvailableSlot, MappedAvailableSlots, MisRequestPayload } from './mis.types';
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
  const errorMessage = (axiosError?.response?.data as { error: string })?.error;

  return {
    message: errorMessage || defaultErrorMessage,
    status: axiosError?.response?.status || 404,
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
}: MisRequestPayload) => {
  try {
    const apiResolver = misApiResolvers[resolverName as keyof typeof misApiResolvers];
    const response = await misHttp.request<T>({
      method: apiResolver.method,
      url: Object.entries(params).reduce(
        (url, [key, value]) => url.replace(`:${key}`, String(value)),
        resolverName
      ),
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
