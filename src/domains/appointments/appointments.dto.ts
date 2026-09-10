import { AppointmentStatus } from '@prisma/client';

import type { AppointmentPaymentSummary } from './appointment-payment.service';

/**
 * One visit as the dashboard shows it.
 *
 * An appointment is booked through MIS, so the ids on the row point at two different
 * systems: `patientId`/`doctorId`/`externalId` are MIS ids, while the account fields come
 * from our own tables via `userId`. Both are kept — the account is who the clinic calls,
 * the MIS ids are what the clinic looks the visit up by.
 */
export interface AdminAppointmentDto {
  id: string;
  userId: string;
  /** MIS id the visit is booked under — the account owner's, or a family member's. */
  patientId: string;
  /** MIS id of the appointment request; the key to find it in the clinic's system. */
  externalId: string;
  dateTime: Date;
  status: AppointmentStatus;
  /** Сырой статус МИС с последней сверки — у МИС состояний больше наших трёх. */
  misStatus: string | null;
  /** Когда статус последний раз сверялся с МИС; `null` — ещё ни разу. */
  statusSyncedAt: Date | null;
  isTelemedicine: boolean;
  meetingUrl: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  doctorId: string;
  /** Resolved from MIS, `null` when MIS is unreachable — the row still carries `doctorId`. */
  doctorName: string | null;
  doctorSpecialty: string | null;
  doctorBranch: string | null;
  /** The account that booked it, from our own tables. */
  accountName: string | null;
  accountIin: string | null;
  accountPhone: string;
  /** True when the visit is booked under a MIS id other than the account owner's. */
  isForFamilyMember: boolean;
  /**
   * Деньги за приём: платёж с назначением `APPOINTMENT`, за который пациент заплатил
   * картой при бронировании. `null` — приём по программе, за него платит страховая и
   * своей транзакции у него нет.
   */
  payment: AppointmentPaymentSummary | null;
  /** Короткий ответ на «оплачен картой?» — деньги действительно взяты. */
  isPaid: boolean;
}

export interface AdminAppointmentListParams {
  page: number;
  limit: number;
  search?: string | undefined;
  status?: AppointmentStatus | undefined;
  telemedicine?: boolean | undefined;
  /** `true` — только оплаченные картой, `false` — только приёмы по программе. */
  paid?: boolean | undefined;
  /** `YYYY-MM-DD`, read as whole clinic days. */
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
}
