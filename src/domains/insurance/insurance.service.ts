import axios, {AxiosError} from 'axios';

import {config} from '@/config';
import {AppError} from '@/shared/services/app-error.service';
import {ErrorCodes} from '@/shared/constants/error-codes';
import * as db from '@/infrastructure/db';

import {
  AppointmentItem,
  AvailableInsuranceCity,
  Family,
  InsuranceServiceResponse,
  MedicalNetworkClinic,
  ProfileData,
  Program,
  ProgramExtended,
  RefundRequest,
} from './insurance.types';
import {RefundRequestDTO} from './insurance.dto';
import {insuranceRequest} from './insurance.helpers';
import {
  INSURANCE_API_GET_PROGRAM_BY_ID,
  INSURANCE_API_GET_PROGRAM_CERTIFICATE,
  INSURANCE_API_GET_PROGRAMS,
  INSURANCE_API_GET_USER_FAMILY,
} from './insurance.constants';

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

export const getPrograms = async (beneficiaryId: string) => {
  const { programs } = await insuranceRequest<{ errorCode: number; programs: Program[] }>({
    resolverName: INSURANCE_API_GET_PROGRAMS,
    beneficiaryId,
  });
  return programs;
};

export const getProgramById = async (beneficiaryId: string, programId: string) => {
  const { data: program } = await insuranceRequest<{ errorCode: number; data: ProgramExtended }>({
    resolverName: INSURANCE_API_GET_PROGRAM_BY_ID,
    beneficiaryId,
    params: { programId },
  });
  return program;
};

export const getFamily = async (beneficiaryId: string, programId: string) => {
  const { data: family } = await insuranceRequest<{ errorCode: number; data: Family[] }>({
    resolverName: INSURANCE_API_GET_USER_FAMILY,
    beneficiaryId,
    params: { programId },
  });
  return family;
};

export const getInsuranceCertificate = async (beneficiaryId: string, programId: string) => {
  return insuranceRequest({
    resolverName: INSURANCE_API_GET_PROGRAM_CERTIFICATE,
    beneficiaryId,
    params: { programId },
  });
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

export const getMedicalNetwork = async ({
  token,
  programId,
  cityId,
  type,
}: {
  token: string;
  programId: string;
  cityId: string;
  type?: string;
}) => {
  try {
    const response = await insuranceApi.get<{ errorCode: number; data: MedicalNetworkClinic[] }>(
      `/v3/medical_network/${programId}`,
      { headers: { Authorization: token || '' }, params: { cityId, type } }
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
