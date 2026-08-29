import { ProgramOrderCategory, ProgramOrderStatus } from '@prisma/client';

/**
 * One program in the cart, as the app sends it at checkout.
 *
 * `externalId` is whatever the catalogue that produced the card calls its id — the MIS
 * `oid` for a med plan, our `Checkup.id` for a check-up — so an order row can always be
 * traced back to what was on screen.
 */
export interface ProgramOrderItemInput {
  category: ProgramOrderCategory;
  externalId: string;
  code?: string;
  title: string;
  price: number;
}

/** Payload carried on a `PAID_PROGRAM` payment until it settles. */
export interface ProgramOrderMetadata {
  items: ProgramOrderItemInput[];
  /** Callback number the patient typed at checkout; the account phone is used when absent. */
  contactPhone?: string;
  /** Note the patient left with the order. */
  comment?: string;
}

export interface ProgramOrderItemDto {
  id: string;
  category: ProgramOrderCategory;
  externalId: string;
  code: string | null;
  title: string;
  price: number;
}

export interface ProgramOrderDto {
  id: string;
  status: ProgramOrderStatus;
  total: number;
  contactPhone: string | null;
  comment: string | null;
  paymentId: string;
  createdAt: Date;
  updatedAt: Date;
  items: ProgramOrderItemDto[];
}

/** A dashboard row — the same order plus who placed it. */
export interface ProgramOrderAdminDto extends ProgramOrderDto {
  userId: string;
  patientName: string | null;
  patientIin: string | null;
  patientPhone: string;
}

export interface AdminProgramOrderListParams {
  page: number;
  limit: number;
  search?: string | undefined;
  status?: ProgramOrderStatus | undefined;
  category?: ProgramOrderCategory | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
}

export interface UpdateProgramOrderBody {
  status?: ProgramOrderStatus;
  comment?: string | null;
}

/**
 * Что уходит письмом операторам при новой оплаченной заявке.
 *
 * Совпадает со строкой дашборда: письмо показывает ту же заявку и того же
 * пациента, просто до того, как оператор откроет панель.
 */
export type ProgramOrderEmailData = ProgramOrderAdminDto;
