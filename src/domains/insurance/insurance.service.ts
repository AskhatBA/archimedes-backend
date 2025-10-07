import axios, { AxiosError } from 'axios';

import { config } from '@/config';
import { AppError } from '@/shared/services/app-error.service';
import { ErrorCodes } from '@/shared/constants/error-codes';
import * as db from '@/infrastructure/db';

import {
  InsuranceServiceResponse,
  ProfileData,
  Program,
  Family,
  RefundRequest,
  ProgramExtended,
  AvailableInsuranceCity,
  MedicalNetworkClinic,
  AppointmentItem,
} from './insurance.types';
import { RefundRequestDTO } from './insurance.dto';

const insuranceApi = axios.create({
  baseURL: config.insuranceService.apiUrl,
});

export const sendOtp = async (phone: string, iin: string) => {
  try {
    const response = await insuranceApi.post<InsuranceServiceResponse>('/v3/auth/sendOtp', {
      phoneNumber: phone,
      iin: iin,
    });

    if (response.data.errorCode === -1) {
      throw new AppError(ErrorCodes.INSURANCE_USER_NOT_FOUND, 400);
    }
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorMessage = (axiosError?.response?.data as { error: string })?.error;
    const errorStatus = axiosError?.response?.status === 401 ? 404 : axiosError?.response?.status;

    if (errorMessage) {
      throw new AppError(errorMessage, errorStatus);
    }

    throw new AppError(ErrorCodes.INSURANCE_USER_NOT_FOUND, errorStatus);
  }
};

export const verifyOtp = async (phone: string, otp: string, userId: string) => {
  try {
    const response = await insuranceApi.post<{
      errorCode: number;
      access_token: string;
    }>('/v3/auth/verifyOtp', { phoneNumber: phone, otp });

    if (response.data.errorCode === -1) {
      throw new AppError(ErrorCodes.INVALID_OTP, 400);
    }

    return db.prismaClient.insuranceServiceToken.create({
      data: {
        userId,
        accessToken: response.data.access_token,
      },
    });
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorMessage = (axiosError?.response?.data as { error: string })?.error;
    const errorStatus = axiosError?.response?.status === 401 ? 404 : axiosError?.response?.status;

    if (errorMessage) {
      throw new AppError(errorMessage, errorStatus);
    }

    throw new AppError(ErrorCodes.INSURANCE_USER_NOT_FOUND, errorStatus);
  }
};

export const requestRefund = async (refundRequestBody: RefundRequestDTO, token: string) => {
  try {
    const userProfile = await getProfile(token);

    await insuranceApi.post(
      '/v3/client/refundRequest',
      {
        ...refundRequestBody,
        id: 0,
        senderId: refundRequestBody.programId,
        personId: refundRequestBody.personId || refundRequestBody.programId,
        phoneNo: userProfile.phoneNumber,
      },
      {
        headers: {
          Authorization: token || '',
        },
      }
    );
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorMessage = (axiosError?.response?.data as { error: string })?.error;
    const errorStatus = axiosError?.response?.status === 401 ? 404 : axiosError?.response?.status;

    if (errorMessage) {
      throw new AppError(errorMessage, errorStatus);
    }

    throw new AppError(ErrorCodes.INSURANCE_REFUND_FAILED, errorStatus);
  }
};

export const getRefundRequests = async (token: string) => {
  try {
    const response = await insuranceApi.get<{ errorCode: number; data: RefundRequest[] }>(
      '/v3/client/refundRequests',
      {
        headers: {
          Authorization: token || '',
        },
      }
    );

    return response.data?.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorMessage = (axiosError?.response?.data as { error: string })?.error;
    const errorStatus = axiosError?.response?.status === 401 ? 404 : axiosError?.response?.status;

    if (errorMessage) {
      throw new AppError(errorMessage, errorStatus);
    }

    throw new AppError(ErrorCodes.INSURANCE_REFUND_REQUESTS, errorStatus);
  }
};

export const checkInsuranceToken = async (userId: string) => {
  try {
    return db.prismaClient.insuranceServiceToken.findUnique({
      where: { userId },
    });
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorMessage = (axiosError?.response?.data as { error: string })?.error;
    const errorStatus = axiosError?.response?.status === 401 ? 404 : axiosError?.response?.status;

    if (errorMessage) {
      throw new AppError(errorMessage, errorStatus);
    }

    throw new AppError(ErrorCodes.INSURANCE_SERVICE_TOKEN_NOT_FOUND, errorStatus);
  }
};

export const getProfile = async (token: string) => {
  try {
    const response = await insuranceApi.get<{ errorCode: number; data: ProfileData }>(
      '/v3/client/profile',
      {
        headers: {
          Authorization: token,
        },
      }
    );

    return response.data.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorMessage = (axiosError?.response?.data as { error: string })?.error;
    const errorStatus = axiosError?.response?.status === 401 ? 404 : axiosError?.response?.status;

    if (errorMessage) {
      throw new AppError(errorMessage, errorStatus);
    }

    throw new AppError(ErrorCodes.INSURANCE_SERVICE_TOKEN_NOT_FOUND, errorStatus);
  }
};

export const getPrograms = async (token: string) => {
  try {
    const response = await insuranceApi.get<{ errorCode: number; programs: Program[] }>(
      '/v3/client/programs',
      {
        headers: {
          Authorization: token || '',
        },
      }
    );

    return response.data.programs;
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorMessage = (axiosError?.response?.data as { error: string })?.error;
    const errorStatus = axiosError?.response?.status === 401 ? 404 : axiosError?.response?.status;

    if (errorMessage) {
      throw new AppError(errorMessage, errorStatus);
    }

    throw new AppError(ErrorCodes.INSURANCE_PROGRAMS_NOT_FOUND, errorStatus);
  }
};

export const getProgramById = async (token: string, programId: string) => {
  try {
    const response = await insuranceApi.get<{ errorCode: number; data: ProgramExtended }>(
      `/v3/client/programs/${programId}`,
      {
        headers: {
          Authorization: token || '',
        },
      }
    );

    return response.data.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorMessage = (axiosError?.response?.data as { error: string })?.error;
    const errorStatus = axiosError?.response?.status === 401 ? 404 : axiosError?.response?.status;

    if (errorMessage) {
      throw new AppError(errorMessage, errorStatus);
    }

    throw new AppError(ErrorCodes.INSURANCE_PROGRAMS_NOT_FOUND, errorStatus);
  }
};

export const getFamily = async (token: string, programId: string) => {
  try {
    const response = await insuranceApi.get<{ errorCode: number; data: Family[] }>(
      '/v3/client/family',
      {
        headers: {
          Authorization: token || '',
        },
        params: { programId },
      }
    );

    return response.data.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorMessage = (axiosError?.response?.data as { error: string })?.error;
    const errorStatus = axiosError?.response?.status === 401 ? 404 : axiosError?.response?.status;

    if (errorMessage) {
      throw new AppError(errorMessage, errorStatus);
    }

    throw new AppError(ErrorCodes.INSURANCE_FAMILY_INFO_NOT_FOUND, errorStatus);
  }
};

export const getInsuranceCertificate = async (token: string, programId: string) => {
  try {
    const response = await insuranceApi.get(`v3/certificate/${programId}`, {
      headers: { Authorization: token || '' },
    });

    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorMessage = (axiosError?.response?.data as { error: string })?.error;
    const errorStatus = axiosError?.response?.status === 401 ? 404 : axiosError?.response?.status;

    if (errorMessage) {
      throw new AppError(errorMessage, errorStatus);
    }

    throw new AppError(ErrorCodes.INSURANCE_FAMILY_INFO_NOT_FOUND, errorStatus);
  }
};

export const getAvailableCities = async (token: string) => {
  try {
    const response = await insuranceApi.get<{ errorCode: number; data: AvailableInsuranceCity[] }>(
      '/v3/cities',
      { headers: { Authorization: token || '' } }
    );

    return response.data.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorMessage = (axiosError?.response?.data as { error: string })?.error;
    const errorStatus = axiosError?.response?.status === 401 ? 404 : axiosError?.response?.status;

    if (errorMessage) {
      throw new AppError(errorMessage, errorStatus);
    }

    throw new AppError(ErrorCodes.INSURANCE_FAMILY_INFO_NOT_FOUND, errorStatus);
  }
};

export const getMedicalNetwork = async (token: string, programId: string, cityId: string) => {
  try {
    const response = await insuranceApi.get<{ errorCode: number; data: MedicalNetworkClinic[] }>(
      `/v3/medical_network/${programId}`,
      { headers: { Authorization: token || '' }, params: { cityId } }
    );

    return response.data.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorMessage = (axiosError?.response?.data as { error: string })?.error;
    const errorStatus = axiosError?.response?.status === 401 ? 404 : axiosError?.response?.status;

    if (errorMessage) {
      throw new AppError(errorMessage, errorStatus);
    }

    throw new AppError(ErrorCodes.INSURANCE_FAMILY_INFO_NOT_FOUND, errorStatus);
  }
};

export const getElectronicReferrals = async (token: string, programId: string) => {
  try {
    const response = await insuranceApi.get<{ errorCode: number; data: AppointmentItem[] }>(
      '/v3/client/appointments',
      { headers: { Authorization: token || '' }, params: { programId } }
    );

    return response.data.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    const errorMessage = (axiosError?.response?.data as { error: string })?.error;
    const errorStatus = axiosError?.response?.status === 401 ? 404 : axiosError?.response?.status;

    if (errorMessage) {
      throw new AppError(errorMessage, errorStatus);
    }

    throw new AppError(ErrorCodes.INSURANCE_FAMILY_INFO_NOT_FOUND, errorStatus);
  }
};
