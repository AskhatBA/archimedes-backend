import { insuranceApiResolverDefault } from './insurance.constants';

export interface InsuranceServiceResponse {
  errorCode: number;
  message?: string;
}

export interface FileType {
  fileType: string;
  fileName: string;
  content: string;
}

export interface ProfileData {
  id: number;
  fullname: string;
  dateOfBirth: string;
  phoneNumber: string;
  bccCardMask: string | null;
  avatar: string | null;
}

export interface Program {
  id: string;
  code: string;
  title: string;
  status: string;
  cardNo: string;
  dateStart: string;
  dateEnd: string;
  /** True for the program that carries the patient's medical account (медсчёт). */
  isMedAccount: boolean;
}

export interface Family {
  id: string;
  fullName: string;
  relationship: string;
  dateBirth: string;
  benId: string;
  cardNo: string;
}

export interface RefundRequest {
  id: number;
  sender: string;
  person: string;
  phoneNo: string;
  date: string;
  amount: number;
  status: string;
}

interface ProgramExtendedSubLimits {
  name: string;
  limit: number;
  currentLimit: number;
  incidentLimit: number;
  currentIncidentLimit: number;
}

export interface ProgramExtended {
  id: string;
  code: string;
  title: string;
  status: string;
  cardNo: string;
  insurer: string;
  insuranceCompany: string;
  dateStart: string;
  dateEnd: string;
  information: string;
  programUrl: string;
  stdexclusions: string;
  exclusions: string;
  inclusions: string;
  limit: number;
  currentLimit: number;
  logo: string;
  subLimits: ProgramExtendedSubLimits[];
}

export interface AvailableInsuranceCity {
  id: number;
  title: string;
}

export interface MedicalNetworkClinic {
  id: number;
  city: number;
  title: string;
  address: string;
  contacts: null;
  latitude: number;
  longitude: number;
  link2GIS: string;
  extraInformation: null;
}

export interface AppointmentDetail {
  id: number;
  service: string;
  amount: number;
}

export interface AppointmentItem {
  id: number;
  date: string;
  name: string;
  medical_institution: string;
  diagnosis: string;
  amount: number;
  currency: string;
  appointmentDetail: AppointmentDetail[];
}

export interface InsuranceRequestPayload {
  resolverName: keyof typeof insuranceApiResolverDefault;
  beneficiaryId?: string;
  payload?: any;
  params?: any;
  query?: any;
  options?: { useDev?: boolean };
}

export interface ContactInfo {
  city: string;
  phones: string[];
}

export interface ClinicType {
  id: number;
  title: string;
}

export interface CheckIinResponse {
  errorCode: number;
  phone?: string;
  message?: string;
}

export interface News {
  image: string;
  title: string;
  date: string;
  message: string;
  url: string;
}

export interface QrAppointmentDetail {
  id: number;
  service: string;
  amount: number;
}

export interface QrAppointmentItem {
  id: number;
  code: number;
  date: string;
  name: string;
  medical_institution: string;
  diagnosis: string;
  amount: number;
  currency: string;
  appointmentDetail: QrAppointmentDetail[];
}

export interface ClinicMO {
  oid: string;
  name: string;
}

export interface PriceListItem {
  service: string;
  price: number;
}

export interface MedicServiceItem {
  oid: string;
  service: string;
  price: number;
}

/** What `/v3/getServicePrice` answers with: `{ price: { price, priceMedAccount } }`. */
export interface ServicePriceResponse {
  price?: {
    price?: number | null;
    priceMedAccount?: number | null;
  } | null;
}

/**
 * Price of one service at one clinic, as the app shows it for a visit booked under the
 * medical-account program.
 */
export interface ServicePrice {
  /** Full price of the service, in KZT. */
  price: number;
  /**
   * What the service costs when paid from the medical account, in KZT. `null` when the
   * insurer gives no such price for this service — the visit then costs the full `price`.
   */
  priceMedAccount: number | null;
}

export interface PayProgramItem {
  oid: string;
  code: string;
  name: string;
  price: number;
  description: string;
  programUrl: string;
}

export interface MedAccount {
  /** `0` when the insurance API served the balance; anything else is its own failure. */
  errorCode: number;
  /** Balance of the beneficiary's medical account, in KZT. */
  totalBalance: number;
}

/**
 * Body of `/v3/topupBalance` — the insurer credits money onto a patient's medical account.
 *
 * The patient is identified by their own details rather than by the beneficiary id in the
 * Authorization header, so all of these are required. `insuranceId` is the exception: it is
 * sent as `null` when the patient has no program flagged `isMedAccount`.
 */
export interface TopupBalancePayload {
  /** Id of the patient's `isMedAccount` program, or `null` when they have none. */
  insuranceId: string | null;
  lastName: string;
  firstName: string;
  middleName: string;
  iin: string;
  /** ISO-8601 date-time, e.g. `1963-03-01T00:00:00.000Z`. */
  dateBirth: string;
  phoneMobile: string;
  /** Amount in tenge. */
  amount: number;
}

/**
 * What `/v3/topupBalance` answers with.
 *
 * `errorCode: 0` is the only success; anything else means the money did not land, and the
 * top-up has to be picked up by an operator. The reference field is not documented, so the
 * candidates below are all optional and whichever comes back is stored on the top-up.
 */
export interface TopupBalanceResponse {
  errorCode: number;
  message?: string;
  /** Reference the insurer books the transfer under, under whichever name it returns it. */
  transactionId?: string | number;
  documentNumber?: string | number;
  id?: string | number;
}
