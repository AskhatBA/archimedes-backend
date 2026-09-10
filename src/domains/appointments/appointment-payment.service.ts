import { PaymentPurpose, PaymentStatus, Prisma } from '@prisma/client';

import { prismaClient } from '@/infrastructure/db';
import { createLogger } from '@/shared/lib/logger';

/**
 * Чем приём связан с деньгами за него.
 *
 * Платный приём отличается от приёма по программе ровно одним: за ним стоит наш платёж.
 * Обычно это `Appointment.paymentId`, который проставляет обработчик оплаты при
 * бронировании. Но приёмы, забронированные до появления этой связи, её не имеют, а деньги
 * за них взяты настоящие — поэтому для них платёж подбирается по метаданным: у платежа с
 * назначением `APPOINTMENT` там лежат `doctorId` и `startTime`, из которых приём и
 * создавался, так что совпадение по обоим однозначно.
 *
 * Правило живёт здесь, а не в отмене, потому что теперь по нему отвечают двое: отмена
 * (решая, должен ли клиника возврат) и админский список (показывая оператору, оплачен ли
 * приём картой). Разойдись они — дашборд говорил бы «по программе» про приём, отмена
 * которого возвращает деньги.
 */

const paymentLinkLogger = createLogger('appointment-payment-link');

/** Приём глазами этого модуля: только то, чем опознаётся его платёж. */
export interface PayableAppointment {
  id: string;
  userId: string;
  doctorId: string;
  dateTime: Date;
}

/** Платёж так, как его показывает дашборд: сумма, состояние и id для сверки. */
export interface AppointmentPaymentSummary {
  id: string;
  amount: number;
  status: PaymentStatus;
  description: string;
  /** Id транзакции в FreedomPay — по нему платёж ищут в кабинете мерчанта. */
  pgPaymentId: string | null;
  createdAt: Date;
}

export const PAYMENT_SUMMARY_SELECT = {
  id: true,
  amount: true,
  status: true,
  description: true,
  pgPaymentId: true,
  createdAt: true,
} as const;

/**
 * Тот ли это платёж.
 *
 * Метаданные платежа — это тело брони, отложенное до оплаты, так что `doctorId` и
 * `startTime` в них те же самые, из которых создан приём.
 */
const paymentMatchesAppointment = (
  metadata: Prisma.JsonValue | null,
  appointment: Pick<PayableAppointment, 'doctorId' | 'dateTime'>
): boolean => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;

  const { doctorId, startTime } = metadata as Prisma.JsonObject;

  if (doctorId !== appointment.doctorId || typeof startTime !== 'string') return false;

  const paidFor = new Date(startTime).getTime();

  return !Number.isNaN(paidFor) && paidFor === appointment.dateTime.getTime();
};

/**
 * Сколько несвязанных платежей просматривается за раз.
 *
 * Набор кандидатов и так узкий — успешные платежи за приём, ни к одному приёму не
 * привязанные, у перечисленных пользователей, — то есть почти только наследство: всё
 * забронированное после появления связи привязывается сразу. Предел стоит на случай
 * пользователя с длинной историей, чтобы одна страница списка не вычитала её целиком.
 */
const CANDIDATE_LIMIT = 500;

/**
 * Дописывает найденную связь в приём.
 *
 * Best effort: связь — это удобство (в следующий раз платёж найдётся напрямую), а не
 * условие чего-либо. Проиграли гонку за уникальный индекс — просто идём дальше.
 */
const linkPayment = async (appointmentId: string, paymentId: string): Promise<void> => {
  try {
    await prismaClient.appointment.update({
      where: { id: appointmentId },
      data: { paymentId },
    });
  } catch (error) {
    paymentLinkLogger.warn(
      { err: error, appointmentId, paymentId },
      'Could not link the appointment to its payment'
    );
  }
};

/**
 * Подбирает платежи приёмам, у которых нет `paymentId`.
 *
 * Кандидаты читаются одним запросом на всю переданную пачку, поэтому страница списка
 * стоит один запрос, а не по одному на строку. Найденное сразу записывается в приём —
 * тот самый back-fill, который делает строку самодостаточной и заодно чинит возврат,
 * если этот приём потом отменят.
 */
export const resolveLegacyAppointmentPayments = async (
  appointments: PayableAppointment[]
): Promise<Map<string, AppointmentPaymentSummary>> => {
  const resolved = new Map<string, AppointmentPaymentSummary>();

  if (appointments.length === 0) return resolved;

  const candidates = await prismaClient.payment.findMany({
    where: {
      userId: { in: [...new Set(appointments.map((appointment) => appointment.userId))] },
      purpose: PaymentPurpose.APPOINTMENT,
      // Оплаченным считаем только успешный платёж: отменённый или проваленный денег не взял.
      status: PaymentStatus.SUCCESS,
      // Уже привязанный к другому приёму платёж не наш.
      appointment: { is: null },
    },
    select: { ...PAYMENT_SUMMARY_SELECT, userId: true, metadata: true },
    orderBy: { createdAt: 'desc' },
    take: CANDIDATE_LIMIT,
  });

  if (candidates.length === 0) return resolved;

  // Один платёж — один приём: старые данные могут содержать пару приёмов с одинаковыми
  // врачом и временем, и второму из них этот платёж уже не принадлежит.
  const taken = new Set<string>();

  for (const appointment of appointments) {
    const match = candidates.find(
      ({ id, userId, metadata }) =>
        !taken.has(id) &&
        userId === appointment.userId &&
        paymentMatchesAppointment(metadata, appointment)
    );

    if (!match) continue;

    taken.add(match.id);

    const { userId: _userId, metadata: _metadata, ...summary } = match;

    resolved.set(appointment.id, summary);
  }

  await Promise.all(
    [...resolved].map(([appointmentId, payment]) => linkPayment(appointmentId, payment.id))
  );

  return resolved;
};

/**
 * Платёж одного приёма — сначала по связи, потом по метаданным.
 *
 * `null` означает «приём по программе»: платить было нечем и возвращать нечего.
 */
export const resolveAppointmentPayment = async (
  appointment: PayableAppointment & { paymentId: string | null }
): Promise<AppointmentPaymentSummary | null> => {
  if (appointment.paymentId) {
    const payment = await prismaClient.payment.findUnique({
      where: { id: appointment.paymentId },
      select: PAYMENT_SUMMARY_SELECT,
    });

    return payment && payment.status === PaymentStatus.SUCCESS ? payment : null;
  }

  const resolved = await resolveLegacyAppointmentPayments([appointment]);

  return resolved.get(appointment.id) ?? null;
};
