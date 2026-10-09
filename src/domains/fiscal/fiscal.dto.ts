import { FiscalOperationType, FiscalReceiptStatus, PaymentPurpose, Prisma } from '@prisma/client';

/** Строка очереди чеков в дашборде: чек, платёж за ним и пациент. */
export interface FiscalReceiptAdminDto {
  id: string;
  paymentId: string;
  refundId: string | null;
  userId: string;
  operationType: FiscalOperationType;
  status: FiscalReceiptStatus;
  externalCheckNumber: string;
  amount: number;
  cashboxUniqueNumber: string;
  checkNumber: string | null;
  registrationNumber: string | null;
  checkOrderNumber: number | null;
  shiftNumber: number | null;
  offlineMode: boolean | null;
  fiscalizedAt: Date | null;
  ticketUrl: string | null;
  ticketPrintUrl: string | null;
  attempts: number;
  retryRound: number;
  lastErrorCode: number | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Назначение платежа, за который чек. */
  purpose: PaymentPurpose;
  /** Id транзакции FreedomPay — по нему платёж ищут в кабинете мерчанта. */
  pgPaymentId: string | null;
  patientName: string | null;
  patientIin: string | null;
  patientPhone: string;
}

/** Карточка чека: то же плюс снимок того, что ушло в Webkassa. */
export interface FiscalReceiptAdminDetailDto extends FiscalReceiptAdminDto {
  positions: Prisma.JsonValue | null;
}

export interface AdminFiscalReceiptListParams {
  page: number;
  limit: number;
  status?: FiscalReceiptStatus | undefined;
  operationType?: FiscalOperationType | undefined;
  /** `YYYY-MM-DD`, день кассы (Asia/Almaty). */
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  search?: string | undefined;
}

export interface ShiftCloseResponse {
  closed: boolean;
  shiftNumber: number | null;
}
