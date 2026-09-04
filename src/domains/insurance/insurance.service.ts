import { Prisma } from '@prisma/client';

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
  News,
  QrAppointmentItem,
  ClinicMO,
  PriceListItem,
  MedicServiceItem,
  PayProgramItem,
  MedAccount,
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
  INSURANCE_API_GET_NEWS,
  INSURANCE_API_QR_GET_APPOINTMENTS,
  INSURANCE_API_QR_SUBMIT_APPOINTMENT,
  INSURANCE_API_GET_CLINICS_MO,
  INSURANCE_API_GET_PRICE_LIST,
  INSURANCE_API_GET_MEDIC_SERVICE,
  INSURANCE_API_GET_PAY_PROGRAMS,
  INSURANCE_API_GET_MED_ACCOUNT,
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
  status: ElectronicReferralServiceStatus,
  satisfactionLevel: string
) => {
  const response = await insuranceRequest<{ errorCode: number; data: AppointmentItem }>({
    resolverName: INSURANCE_API_UPDATE_ELECTRONIC_REFERRALS,
    beneficiaryId,
    query: {
      AppointmentId: Number(appointmentId),
      SatisfactionLevel: Number(satisfactionLevel),
      Status: Number(status),
    },
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

export const getNews = async () => {
  const response = await insuranceRequest<{ errorCode: number; data: News[] }>({
    resolverName: INSURANCE_API_GET_NEWS,
  });
  return response.data;
};

export const getQrAppointments = async (beneficiaryId: string, clinicId: string) => {
  const response = await insuranceRequest<{ errorCode: number; data: QrAppointmentItem[] }>({
    resolverName: INSURANCE_API_QR_GET_APPOINTMENTS,
    beneficiaryId,
    query: { clinicId },
  });
  return response.data;
};

export const submitQrAppointment = async (
  beneficiaryId: string,
  clinicId: string,
  appCode: number
) => {
  const response = await insuranceRequest<{ errorCode: number; data: unknown }>({
    resolverName: INSURANCE_API_QR_SUBMIT_APPOINTMENT,
    beneficiaryId,
    query: { clinicId, appCode },
  });
  return response.data;
};

export const getClinicsMO = async (beneficiaryId: string) => {
  const response = await insuranceRequest<ClinicMO[]>({
    resolverName: INSURANCE_API_GET_CLINICS_MO,
    beneficiaryId,
  });
  return response;
};

export const getPriceList = async (beneficiaryId: string, clinicId: string) => {
  const response = await insuranceRequest<PriceListItem[]>({
    resolverName: INSURANCE_API_GET_PRICE_LIST,
    beneficiaryId,
    query: { clinicId },
  });
  return response;
};

export const getMedicService = async (
  beneficiaryId: string,
  clinicId: string,
  medicIIN: string
) => {
  const response = await insuranceRequest<MedicServiceItem>({
    resolverName: INSURANCE_API_GET_MEDIC_SERVICE,
    beneficiaryId,
    query: { clinicId, medicIIN },
  });
  return response;
};

export const getPayPrograms = async (beneficiaryId: string) => {
  const response = await insuranceRequest<PayProgramItem[]>({
    resolverName: INSURANCE_API_GET_PAY_PROGRAMS,
    beneficiaryId,
  });
  return response;
};

/**
 * Balance of the beneficiary's medical account ("медсчёт") — the prepaid money the clinic
 * lets a patient spend on services.
 *
 * The insurance API answers `{ errorCode, totalBalance }` for any beneficiary it accepts,
 * and an id it does not know is not an error there: it comes back as `errorCode: 0` with a
 * zero balance rather than a 404, so there is nothing to distinguish here.
 */
export const getMedAccount = async (beneficiaryId: string) => {
  const response = await insuranceRequest<MedAccount>({
    resolverName: INSURANCE_API_GET_MED_ACCOUNT,
    beneficiaryId,
  });
  return response;
};

export type AdminRefundListParams = {
  page: number;
  limit: number;
  search?: string | undefined;
  category?: number | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
};

/**
 * The MIS answers a refund submission with an `errorCode` — 0 means it accepted the
 * request, anything else (or a missing response) means it never landed there. That is
 * the only outcome signal we persist, so it is what the dashboard shows.
 */
const refundState = (externalResponse: unknown): 'accepted' | 'failed' | 'unknown' => {
  if (!externalResponse || typeof externalResponse !== 'object') {
    return 'unknown';
  }

  const errorCode = (externalResponse as { errorCode?: unknown }).errorCode;

  if (typeof errorCode !== 'number') {
    return 'unknown';
  }

  return errorCode === 0 ? 'accepted' : 'failed';
};

const countFiles = (files: unknown) => (Array.isArray(files) ? files.length : 0);

/**
 * Dashboard-wide refund listing. Unlike `getLocalRefundRequests` this is not scoped to
 * one user — the caller is an ADMIN — so it paginates and reads the patient name from
 * our own DB instead of round-tripping to the MIS profile API per row.
 */
export const getAdminRefundRequests = async ({
  page,
  limit,
  search,
  category,
  dateFrom,
  dateTo,
}: AdminRefundListParams) => {
  const where: Prisma.InsuranceRefundRequestWhereInput = {};

  if (typeof category === 'number') {
    where.category = category;
  }

  // `date` is the free-form claim date the mobile app sends (ISO `YYYY-MM-DD`), so it
  // sorts lexicographically and a string range is a valid filter on it.
  if (dateFrom || dateTo) {
    where.date = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  if (search) {
    where.user = {
      OR: [
        { phone: { contains: search, mode: 'insensitive' } },
        { patient: { fullName: { contains: search, mode: 'insensitive' } } },
        { patient: { iin: { contains: search } } },
      ],
    };
  }

  const [total, rows, totals] = await Promise.all([
    db.prismaClient.insuranceRefundRequest.count({ where }),
    db.prismaClient.insuranceRefundRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        userId: true,
        beneficiaryId: true,
        personId: true,
        programId: true,
        category: true,
        date: true,
        amount: true,
        comments: true,
        files: true,
        externalResponse: true,
        createdAt: true,
        user: {
          select: {
            phone: true,
            patient: { select: { fullName: true, iin: true } },
          },
        },
      },
    }),
    // Sum over the whole filtered set, not just the current page — the dashboard shows
    // it as the header figure for the active filters.
    db.prismaClient.insuranceRefundRequest.aggregate({ where, _sum: { amount: true } }),
  ]);

  return {
    items: rows.map(({ user, files, externalResponse, ...refund }) => ({
      ...refund,
      patientName: user.patient?.fullName ?? null,
      patientIin: user.patient?.iin ?? null,
      patientPhone: user.phone,
      filesCount: countFiles(files),
      state: refundState(externalResponse),
    })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    totalAmount: totals._sum.amount ?? 0,
  };
};
