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
