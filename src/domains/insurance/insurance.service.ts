import * as db from '@/infrastructure/db';

import { RefundRequestDTO } from './insurance.dto';
import { insuranceRequest } from './insurance.helpers';
import {
  AppointmentItem,
  AvailableInsuranceCity,
  ContactInfo,
  Family,
  MedicalNetworkClinic,
  ProfileData,
  Program,
  ProgramExtended,
  RefundRequest,
  ClinicType,
  CheckIinResponse,
} from './insurance.types';
import {
  INSURANCE_API_GET_CITIES,
  INSURANCE_API_GET_CLINIC_TYPES,
  INSURANCE_API_GET_CONTACTS,
  INSURANCE_API_GET_ELECTRONIC_REFERRALS,
  INSURANCE_API_GET_MEDICAL_NETWORK,
  INSURANCE_API_GET_PROGRAM_BY_ID,
  INSURANCE_API_GET_PROGRAM_CERTIFICATE,
  INSURANCE_API_GET_PROGRAMS,
  INSURANCE_API_GET_REFUND_REQUESTS,
  INSURANCE_API_GET_USER_FAMILY,
  INSURANCE_API_GET_USER_PROFILE,
  INSURANCE_API_REFUND_REQUEST,
  INSURANCE_API_SEND_OTP,
  INSURANCE_API_UPDATE_ELECTRONIC_REFERRALS,
  INSURANCE_API_CHECK_IIN,
  ElectronicReferralServiceStatus,
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

export const requestRefund = async (
  refundRequestBody: RefundRequestDTO,
  beneficiaryId: string,
  userId: string
) => {
  const userProfile = await getProfile(beneficiaryId);

  const externalResponse = await insuranceRequest({
    resolverName: INSURANCE_API_REFUND_REQUEST,
    beneficiaryId,
    payload: {
      ...refundRequestBody,
      senderId: refundRequestBody.programId,
      personId: refundRequestBody.personId || refundRequestBody.programId,
      phoneNo: userProfile.phoneNumber,
    },
  });

  await db.prismaClient.insuranceRefundRequest.create({
    data: {
      userId,
      beneficiaryId,
      personId: refundRequestBody.personId || refundRequestBody.programId,
      programId: refundRequestBody.programId,
      category: refundRequestBody.category,
      date: refundRequestBody.date,
      amount: refundRequestBody.amount,
      comments: refundRequestBody.comments,
      files: refundRequestBody.files.map(({ fileType, fileName }) => ({ fileType, fileName })),
      externalResponse: externalResponse as object,
    },
  });

  return externalResponse;
};

export const getRefundRequests = async (beneficiaryId: string) => {
  const response = await insuranceRequest<{ errorCode: number; data: RefundRequest[] }>({
    resolverName: INSURANCE_API_GET_REFUND_REQUESTS,
    beneficiaryId,
  });
  return response.data;
};

export const getLocalRefundRequests = async (userId: string) => {
  const refundRequests = await db.prismaClient.insuranceRefundRequest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      beneficiaryId: true,
      personId: true,
      programId: true,
      category: true,
      date: true,
      amount: true,
      comments: true,
      files: true,
      createdAt: true,
      externalResponse: true,
    },
  });

  const profilesMap = new Map<string, ProfileData>();

  const uniqueBeneficiaryIds = [...new Set(refundRequests.map((req) => req.beneficiaryId))];
  const profiles = await Promise.all(uniqueBeneficiaryIds.map((id) => getProfile(id)));

  uniqueBeneficiaryIds.forEach((id, index) => {
    profilesMap.set(id, profiles[index]);
  });

  return refundRequests.map((refundReq) => ({
    ...refundReq,
    personName: profilesMap.get(refundReq.beneficiaryId)?.fullname,
  }));
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

export const updateElectronicReferralServiceStatus = async (
  beneficiaryId: string,
  appointmentId: string,
  satisfactionLevel: ElectronicReferralServiceStatus
) => {
  const response = await insuranceRequest<{ errorCode: number; data: AppointmentItem }>({
    resolverName: INSURANCE_API_UPDATE_ELECTRONIC_REFERRALS,
    beneficiaryId,
    query: { AppointmentId: Number(appointmentId), SatisfactionLevel: Number(satisfactionLevel) },
  });
  return response.data;
};

export const getClinicTypes = async (beneficiaryId: string) => {
  const response = await insuranceRequest<{ errorCode: number; data: ClinicType[] }>({
    resolverName: INSURANCE_API_GET_CLINIC_TYPES,
    beneficiaryId,
  });
  return response.data;
};

export const checkIin = async (iin: string) => {
  const response = await insuranceRequest<CheckIinResponse>({
    resolverName: INSURANCE_API_CHECK_IIN,
    query: { iin },
  });
  return response;
};
