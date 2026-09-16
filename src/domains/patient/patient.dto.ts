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

/**
 * What the dashboard may change on a patient profile. Everything else is either derived
 * (`fullName`, `misPatientId`) or not ours to edit here — the phone lives on `User` and
 * is the login, so it is deliberately absent.
 */
export interface AdminUpdatePatientBody {
  firstName?: string;
  lastName?: string;
  /** `null` or `''` clears it; the column stores `''` for "no patronymic". */
  patronymic?: string | null;
  iin?: string;
}

export interface AdminUpdatePatientResult {
  patient: AdminPatientListItem;
  /** Fields whose value actually changed — enough to review the edit in the audit trail. */
  changedFields: string[];
  /** Set only when the IIN changed, so the audit trail can say what it was re-linked from. */
  relinked?: {
    previousIin: string;
    previousMisPatientId: string;
  };
}

export interface AdminPatientListResponse {
  items: AdminPatientListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
