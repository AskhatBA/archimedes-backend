import { Patient } from '@prisma/client';

import { Gender } from '@/shared/types/gender';

export interface PatientDto {
  userId: Patient['userId'];
  gender: Patient['gender'];
  birthDate: Patient['birthDate'];
  firstName: Patient['firstName'];
  patronymic?: Patient['patronymic'];
  lastName: Patient['lastName'];
  iin: string;
  misPatientId: string;
}

export interface AdminPatientListParams {
  page: number;
  limit: number;
  /** Free-form: full name, IIN or phone. */
  search?: string | undefined;
  gender?: Gender | undefined;
}

export interface AdminPatientListItem {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  patronymic: string;
  fullName: string;
  birthDate: string;
  gender: string;
  iin: string;
  misPatientId: string;
  phone: string;
  email: string | null;
  appointmentsCount: number;
  refundsCount: number;
}

export interface AdminPatientListResponse {
  items: AdminPatientListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
