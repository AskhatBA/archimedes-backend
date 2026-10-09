import { FiscalOperationType, FiscalReceiptStatus, PaymentStatus, Prisma } from '@prisma/client';

import { prismaClient } from '@/infrastructure/db';

import { UNKNOWN_DOCTOR, readDoctors } from './appointment-doctors.service';
import {
  AppointmentPaymentSummary,
  PAYMENT_SUMMARY_SELECT,
  resolveLegacyAppointmentPayments,
} from './appointment-payment.service';
import type { AppointmentHistoryItemDto } from './appointments.dto';

/**
 * The patient's own booking history, read from our `Appointment` table.
 *
 * Unlike the MIS proxy (`GET /mis/appointment-history`), this is every visit booked through
 * the app — cancelled ones included — with what was paid for it and what came back. A row
 * only carries MIS ids, so doctor and branch are put on it through
 * `appointment-doctors.service`, which is why this is not in `appointments.service`.
 */

/**
 * The newest visits only. A patient's history is short, but each distinct doctor on it is
 * a MIS lookup, so the list is bounded rather than trusted to stay small.
 */
const HISTORY_LIMIT = 200;

const historyInclude = {
  payment: {
    select: {
      ...PAYMENT_SUMMARY_SELECT,
      // Чек продажи читается тем же запросом, без запроса на строку. Пациенту виден только
      // выпущенный чек: PENDING/FAILED — работа оператора.
      fiscalReceipts: {
        where: {
          operationType: FiscalOperationType.SALE,
          status: FiscalReceiptStatus.ISSUED,
        },
        select: { ticketUrl: true },
        take: 1,
      },
    },
  },
  refund: {
    select: {
      amount: true,
      feeAmount: true,
      status: true,
      refundedAt: true,
      fiscalReceipt: { select: { status: true, ticketUrl: true } },
    },
  },
} as const;

type HistoryRow = Prisma.AppointmentGetPayload<{ include: typeof historyInclude }>;

export const getAppointmentHistory = async (
  userId: string
): Promise<AppointmentHistoryItemDto[]> => {
  const [rows, patient] = await Promise.all([
    prismaClient.appointment.findMany({
      where: { userId },
      orderBy: { dateTime: 'desc' },
      take: HISTORY_LIMIT,
      include: historyInclude,
    }),
    prismaClient.patient.findUnique({ where: { userId }, select: { misPatientId: true } }),
  ]);

  const [doctors, legacyPayments] = await Promise.all([
    readDoctors(rows.map((row) => row.doctorId)),
    // Приёмы, забронированные до появления `paymentId`, узнают свой платёж по метаданным —
    // иначе оплаченный картой приём выглядел бы в истории как приём по программе.
    resolveLegacyAppointmentPayments(rows.filter((row) => row.paymentId === null)),
  ]);

  const toDto = ({ payment, refund, ...row }: HistoryRow): AppointmentHistoryItemDto => {
    const doctor = doctors.get(row.doctorId) ?? UNKNOWN_DOCTOR;
    const paidWith: AppointmentPaymentSummary | null =
      payment ?? legacyPayments.get(row.id) ?? null;
    const isPaid = paidWith?.status === PaymentStatus.SUCCESS;

    return {
      id: row.id,
      externalId: row.externalId,
      dateTime: row.dateTime,
      status: row.status,
      isTelemedicine: row.isTelemedicine,
      doctorName: doctor.name,
      doctorSpecialty: doctor.specialty,
      branchName: doctor.branch,
      branchAddress: doctor.branchAddress,
      isForFamilyMember: Boolean(patient?.misPatientId && patient.misPatientId !== row.patientId),
      // Только успешный платёж — тот же критерий, по которому отмена решает о возврате.
      paidAmount: isPaid ? paidWith.amount : null,
      // Приёмы, привязанные к платежу по метаданным, оплачены до запуска фискализации —
      // чека у них нет и не будет.
      receiptUrl: isPaid ? (payment?.fiscalReceipts[0]?.ticketUrl ?? null) : null,
      refund: refund
        ? {
            amount: refund.amount,
            feeAmount: refund.feeAmount,
            status: refund.status,
            refundedAt: refund.refundedAt,
            receiptUrl:
              refund.fiscalReceipt?.status === FiscalReceiptStatus.ISSUED
                ? (refund.fiscalReceipt.ticketUrl ?? null)
                : null,
          }
        : null,
      cancelledAt: row.cancelledAt,
      createdAt: row.createdAt,
    };
  };

  return rows.map(toDto);
};
