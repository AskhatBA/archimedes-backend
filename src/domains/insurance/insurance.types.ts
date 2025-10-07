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
}

export interface Family {
  id: string;
  fullName: string;
  relationship: string;
  dateBirth: string;
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
