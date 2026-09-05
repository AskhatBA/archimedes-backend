import { MedAccountTopupStatus } from '@prisma/client';

/** One selectable amount as the mobile app consumes it. */
export interface MedAccountOptionItem {
  id: string;
  /** Amount in tenge. */
  amount: number;
  label: string | null;
  popular: boolean;
}

/** The same entry plus the bookkeeping only the dashboard has a use for. */
export interface MedAccountOptionAdminItem extends MedAccountOptionItem {
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMedAccountOptionBody {
  amount: number;
  label?: string | null;
  popular?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

/** Every field is optional — the dashboard sends only what the admin actually changed. */
export type UpdateMedAccountOptionBody = Partial<CreateMedAccountOptionBody>;

/**
 * Payload the app attaches to `POST /payment/init` for a top-up.
 *
 * Only the option is named: the amount that gets charged is the one on the catalogue row,
 * checked against the payment before the payer is sent to the provider.
 */
export interface MedAccountTopupMetadata {
  optionId: string;
}

export interface MedAccountTopupDto {
  id: string;
  amount: number;
  status: MedAccountTopupStatus;
  paymentId: string;
  optionId: string | null;
  externalRef: string | null;
  comment: string | null;
  creditedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** What the dashboard's top-up queue shows: the row plus who paid it. */
export interface MedAccountTopupAdminDto extends MedAccountTopupDto {
  userId: string;
  beneficiaryId: string | null;
  patientName: string | null;
  patientIin: string | null;
  patientPhone: string;
}

export type AdminTopupListParams = {
  page: number;
  limit: number;
  search?: string | undefined;
  status?: MedAccountTopupStatus | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
};

/** Only the operator-owned columns — the amount belongs to the payment and is immutable. */
export interface UpdateMedAccountTopupBody {
  status?: MedAccountTopupStatus;
  comment?: string | null;
}
