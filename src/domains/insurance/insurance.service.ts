import * as db from '@/infrastructure/db';

import { RefundRequestDTO } from './insurance.dto';
import { insuranceRequest } from './insurance.helpers';
import {
  AppointmentItem,
  AvailableInsuranceCity,
  Family,
  MedicalNetworkClinic,
  ProfileData,
  Program,
  ProgramExtended,
  RefundRequest,
  ContactInfo,
} from './insurance.types';
import {
  INSURANCE_API_GET_PROGRAM_BY_ID,
  INSURANCE_API_GET_PROGRAM_CERTIFICATE,
  INSURANCE_API_GET_PROGRAMS,
  INSURANCE_API_GET_USER_FAMILY,
  INSURANCE_API_GET_CITIES,
  INSURANCE_API_GET_USER_PROFILE,
  INSURANCE_API_SEND_OTP,
  INSURANCE_API_REFUND_REQUEST,
  INSURANCE_API_GET_REFUND_REQUESTS,
  INSURANCE_API_GET_MEDICAL_NETWORK,
  INSURANCE_API_GET_CONTACTS,
  INSURANCE_API_GET_ELECTRONIC_REFERRALS,
} from './insurance.constants';

export const sendOtp = async (phone: string, iin: string) => {
  return insuranceRequest({
    resolverName: INSURANCE_API_SEND_OTP,
    payload: { phoneNumber: phone, iin: iin },
  });
};

export const verifyOtp = async (phone: string, otp: string, userId: string) => {
  const { access_token } = await insuranceRequest<{
    errorCode: number;
    access_token: string;
  }>({
    resolverName: INSURANCE_API_GET_PROGRAM_BY_ID,
    payload: { phoneNumber: phone, otp },
  });

  return db.prismaClient.insuranceServiceToken.create({
    data: {
      userId,
      accessToken: access_token,
    },
  });
};

export const requestRefund = async (refundRequestBody: RefundRequestDTO, beneficiaryId: string) => {
  const userProfile = await getProfile(beneficiaryId);

  return insuranceRequest({
    resolverName: INSURANCE_API_REFUND_REQUEST,
    beneficiaryId,
    payload: {
      ...refundRequestBody,
      senderId: refundRequestBody.programId,
      personId: refundRequestBody.personId || refundRequestBody.programId,
      phoneNo: userProfile.phoneNumber,
    },
  });
};

export const getRefundRequests = async (beneficiaryId: string) => {
  const response = await insuranceRequest<{ errorCode: number; data: RefundRequest[] }>({
    resolverName: INSURANCE_API_GET_REFUND_REQUESTS,
    beneficiaryId,
  });
  return response.data;
};

export const getProfile = async (beneficiaryId: string) => {
  const response = await insuranceRequest<{ errorCode: number; data: ProfileData }>({
    resolverName: INSURANCE_API_GET_USER_PROFILE,
    beneficiaryId,
  });
  return response.data;
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
    query: { programId },
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

export const getAvailableCities = async (beneficiaryId: string) => {
  const response = await insuranceRequest<{ errorCode: number; data: AvailableInsuranceCity[] }>({
    resolverName: INSURANCE_API_GET_CITIES,
    beneficiaryId,
  });
  return response.data;
};

export const getMedicalNetwork = async ({
  beneficiaryId,
  programId,
  cityId,
  type,
}: {
  beneficiaryId: string;
  programId: string;
  cityId: string;
  type?: string;
}) => {
  const response = await insuranceRequest<{ errorCode: number; data: MedicalNetworkClinic[] }>({
    resolverName: INSURANCE_API_GET_MEDICAL_NETWORK,
    beneficiaryId,
    params: { programId },
    query: { cityId, type },
  });
  return response.data;
};

export const getContacts = async (beneficiaryId: string) => {
  const response = await insuranceRequest<{ errorCode: number; data: ContactInfo[] }>({
    resolverName: INSURANCE_API_GET_CONTACTS,
    beneficiaryId,
  });
  return response.data;
};

export const getElectronicReferrals = async (beneficiaryId: string, programId: string) => {
  const response = await insuranceRequest<{ errorCode: number; data: AppointmentItem[] }>({
    resolverName: INSURANCE_API_GET_ELECTRONIC_REFERRALS,
    beneficiaryId,
    query: { programId },
  });
  return response.data;
};
