import { PaymentStatus, Prisma } from '@prisma/client';

import * as misService from '@/domains/mis/mis.service';
import { prismaClient } from '@/infrastructure/db';
import { AppError } from '@/shared/services/app-error.service';
import { ErrorCodes } from '@/shared/constants/error-codes';
import { createLogger } from '@/shared/lib/logger';

import {
  AppointmentPaymentSummary,
  PAYMENT_SUMMARY_SELECT,
  resolveLegacyAppointmentPayments,
} from './appointment-payment.service';
import { CLINIC_UTC_OFFSET } from './appointments.service';
import type { AdminAppointmentDto, AdminAppointmentListParams } from './appointments.dto';

/**
 * The dashboard-facing side of the appointments domain.
 *
 * It lives apart from `appointments.service` because it needs MIS to put a name on
 * `doctorId`, and `mis.service` already imports `appointments.service` for the booking
 * conflict rules — reaching for MIS from there would close that import cycle.
 */

const adminLogger = createLogger('appointments-admin');

type DoctorSummary = {
  name: string | null;
  specialty: string | null;
  branch: string | null;
};

const UNKNOWN_DOCTOR: DoctorSummary = { name: null, specialty: null, branch: null };

/**
 * MIS is asked once per doctor per page, and the answer is held for a while: a day's
 * appointments are spread over a handful of doctors, so without this a single page would
 * fire twenty near-identical lookups at the clinic's API.
 */
const DOCTOR_CACHE_TTL_MS = 10 * 60 * 1000;

const doctorCache = new Map<string, { doctor: DoctorSummary; expiresAt: number }>();

const readDoctor = async (doctorId: string): Promise<DoctorSummary> => {
  const cached = doctorCache.get(doctorId);

  if (cached && cached.expiresAt > Date.now()) return cached.doctor;

  try {
    const details = await misService.getDoctorDetailsById(doctorId);
    const doctor: DoctorSummary = {
      name: details.name || null,
      specialty: details.specialty?.name || null,
      branch: details.branch?.name || null,
    };

    doctorCache.set(doctorId, { doctor, expiresAt: Date.now() + DOCTOR_CACHE_TTL_MS });

    return doctor;
  } catch (error) {
    // A MIS outage must not empty the queue — the row keeps its `doctorId` and the
    // dashboard shows that instead of a name.
    adminLogger.warn({ err: error, doctorId }, 'Failed to resolve doctor from MIS');

    return UNKNOWN_DOCTOR;
  }
};

const readDoctors = async (doctorIds: string[]): Promise<Map<string, DoctorSummary>> => {
  const unique = [...new Set(doctorIds)];
  const resolved = await Promise.all(unique.map((id) => readDoctor(id)));

  return new Map(unique.map((id, index) => [id, resolved[index] as DoctorSummary]));
};

// A day filter is a clinic day, not a server day: an 18:00 Almaty slot is 13:00 UTC, so
// bounding on the server's midnight would drop the evening off the end of a range.
const startOfClinicDay = (day: string) => new Date(`${day}T00:00:00.000${CLINIC_UTC_OFFSET}`);
const endOfClinicDay = (day: string) => new Date(`${day}T23:59:59.999${CLINIC_UTC_OFFSET}`);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const buildWhere = ({
  search,
  status,
  telemedicine,
  paid,
  dateFrom,
  dateTo,
}: Omit<AdminAppointmentListParams, 'page' | 'limit'>): Prisma.AppointmentWhereInput => {
  const where: Prisma.AppointmentWhereInput = {};

  if (status) where.status = status;
  if (telemedicine !== undefined) where.isTelemedicine = telemedicine;
  // Фильтр читает только записанную связь: приём старше неё попадёт в «по программе», пока
  // его платёж не будет подобран по метаданным — что и делает показ страницы со строкой.
  if (paid !== undefined) where.paymentId = paid ? { not: null } : null;

  if (dateFrom || dateTo) {
    where.dateTime = {
      ...(dateFrom ? { gte: startOfClinicDay(dateFrom) } : {}),
      ...(dateTo ? { lte: endOfClinicDay(dateTo) } : {}),
    };
  }

  if (search) {
    where.OR = [
      { user: { phone: { contains: search, mode: 'insensitive' } } },
      { user: { patient: { fullName: { contains: search, mode: 'insensitive' } } } },
      { user: { patient: { iin: { contains: search } } } },
      // An operator chasing a visit in MIS has its ids, not the patient's name — but the
      // columns are `uuid`, so anything else would blow up in Postgres rather than miss.
      ...(UUID_PATTERN.test(search)
        ? [{ externalId: search }, { patientId: search }, { doctorId: search }]
        : []),
    ];
  }

  return where;
};

const listInclude = {
  user: {
    select: {
      phone: true,
      patient: { select: { fullName: true, iin: true, misPatientId: true } },
    },
  },
  // Платёж, если приём оплачен картой: `paymentId` проставляет обработчик оплаты при
  // бронировании, так что связь тут — это и есть ответ «за приёмом стоят наши деньги».
  payment: { select: PAYMENT_SUMMARY_SELECT },
} as const;

type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof listInclude }>;

const toAdminDto = (
  { user, payment, ...appointment }: AppointmentRow,
  doctors: Map<string, DoctorSummary>,
  legacyPayments: Map<string, AppointmentPaymentSummary>
): AdminAppointmentDto => {
  const doctor = doctors.get(appointment.doctorId) ?? UNKNOWN_DOCTOR;
  // Приёмы, забронированные до появления `paymentId`, узнают свой платёж по метаданным.
  const paidWith = payment ?? legacyPayments.get(appointment.id) ?? null;

  return {
    id: appointment.id,
    userId: appointment.userId,
    patientId: appointment.patientId,
    externalId: appointment.externalId,
    dateTime: appointment.dateTime,
    status: appointment.status,
    misStatus: appointment.misStatus,
    statusSyncedAt: appointment.statusSyncedAt,
    isTelemedicine: appointment.isTelemedicine,
    meetingUrl: appointment.meetingUrl || null,
    notes: appointment.notes || null,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
    doctorId: appointment.doctorId,
    doctorName: doctor.name,
    doctorSpecialty: doctor.specialty,
    doctorBranch: doctor.branch,
    accountName: user.patient?.fullName ?? null,
    accountIin: user.patient?.iin ?? null,
    accountPhone: user.phone,
    // Booking for a relative stores the relative's MIS id, so a visit whose `patientId`
    // is not the account's own is one the account owner is not attending.
    isForFamilyMember: Boolean(
      user.patient?.misPatientId && user.patient.misPatientId !== appointment.patientId
    ),
    payment: paidWith,
    // Оплаченным считаем только успешный платёж — тот же критерий, по которому отмена
    // решает, должна ли клиника возврат.
    isPaid: paidWith?.status === PaymentStatus.SUCCESS,
  };
};

/**
 * Подбирает платежи строкам, у которых нет `paymentId`.
 *
 * Приём по программе его и не получит — платить было нечем, — а вот приём, забронированный
 * до появления связи, оплачен настоящими деньгами, и без этого дашборд назвал бы его
 * бесплатным, хотя его отмена вернула бы пациенту всю сумму. Один запрос на страницу, и
 * найденное записывается в приём, так что второй раз искать уже не придётся.
 */
const readLegacyPayments = (rows: AppointmentRow[]) =>
  resolveLegacyAppointmentPayments(rows.filter((row) => row.paymentId === null));

/**
 * Clinic-wide appointment listing for the dashboard. Not scoped to a user — the caller is
 * an ADMIN — so it paginates, and the newest visits come first.
 */
export const getAdminAppointments = async ({
  page,
  limit,
  search,
  status,
  telemedicine,
  paid,
  dateFrom,
  dateTo,
}: AdminAppointmentListParams) => {
  const where = buildWhere({ search, status, telemedicine, paid, dateFrom, dateTo });

  const [total, rows] = await Promise.all([
    prismaClient.appointment.count({ where }),
    prismaClient.appointment.findMany({
      where,
      orderBy: { dateTime: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: listInclude,
    }),
  ]);

  const [doctors, legacyPayments] = await Promise.all([
    readDoctors(rows.map((row) => row.doctorId)),
    readLegacyPayments(rows),
  ]);

  return {
    items: rows.map((row) => toAdminDto(row, doctors, legacyPayments)),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
};

export const getAdminAppointmentById = async (id: string): Promise<AdminAppointmentDto> => {
  const appointment = await prismaClient.appointment.findUnique({
    where: { id },
    include: listInclude,
  });

  if (!appointment) {
    throw new AppError(ErrorCodes.APPOINTMENT_NOT_FOUND, 404);
  }

  const [doctors, legacyPayments] = await Promise.all([
    readDoctors([appointment.doctorId]),
    readLegacyPayments([appointment]),
  ]);

  return toAdminDto(appointment, doctors, legacyPayments);
};
