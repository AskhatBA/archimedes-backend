import { AppointmentRefund, AppointmentRefundStatus, Prisma } from '@prisma/client';

import { config } from '@/config';
import * as paymentService from '@/domains/payment/payment.service';
import { prismaClient } from '@/infrastructure/db';
import { ErrorCodes } from '@/shared/constants/error-codes';
import { createLogger } from '@/shared/lib/logger';
import { AppError } from '@/shared/services/app-error.service';
import * as auditLogService from '@/shared/services/audit-log.service';
import { AuditEvent } from '@/shared/services/audit-log.service';

/**
 * Деньги за отменённый платный приём.
 *
 * Отдельный файл от `appointment-cancellation.service`, потому что здесь нет ни МИС, ни
 * запроса пользователя: строка возврата уже создана отменой, а сюда приходит воркер и
 * разговаривает только с FreedomPay.
 */

const refundLogger = createLogger('appointment-refund');

/** Тенге до копейки — больше FreedomPay всё равно не принимает. */
const toMoney = (value: number): number => Math.round(value * 100) / 100;

const MS_PER_HOUR = 3_600_000;

export interface RefundPlan {
  /** Сколько стоил приём. */
  paidAmount: number;
  /** Доля возврата: 100 при ранней отмене, 100 − удержание при поздней. */
  refundPercent: number;
  /** Сколько вернётся пациенту. */
  amount: number;
  /** Сколько удерживается как компенсация. */
  feeAmount: number;
  /** Часов до приёма на момент расчёта. */
  hoursBefore: number;
  /** До какого момента отмена ещё бесплатная. */
  freeCancellationUntil: Date;
}

/**
 * Считает, сколько вернётся при отмене прямо сейчас.
 *
 * Решение принимается по неокруглённой разнице во времени, а в `hoursBefore` кладётся
 * округлённое значение: иначе отмена за 11 часов 59 минут сохранилась бы как «12.0» и
 * выглядела бы противоречащей удержанию, которое к ней применили.
 */
export const planRefund = ({
  paidAmount,
  appointmentAt,
  now = new Date(),
}: {
  paidAmount: number;
  appointmentAt: Date;
  now?: Date;
}): RefundPlan => {
  const { fullRefundWindowHours, lateCancellationFeePercent } = config.appointmentCancellation;

  const hoursBefore = (appointmentAt.getTime() - now.getTime()) / MS_PER_HOUR;
  const isEarly = hoursBefore >= fullRefundWindowHours;

  const refundPercent = isEarly ? 100 : 100 - lateCancellationFeePercent;
  const amount = toMoney((paidAmount * refundPercent) / 100);

  return {
    paidAmount: toMoney(paidAmount),
    refundPercent,
    amount,
    // Считается вычитанием, а не вторым процентом, чтобы возврат и удержание всегда
    // складывались ровно в уплаченную сумму, как бы ни округлилось деление.
    feeAmount: toMoney(paidAmount - amount),
    hoursBefore: Math.round(hoursBefore * 100) / 100,
    freeCancellationUntil: new Date(appointmentAt.getTime() - fullRefundWindowHours * MS_PER_HOUR),
  };
};

export interface AppointmentRefundDto {
  id: string;
  appointmentId: string;
  paidAmount: number;
  refundPercent: number;
  amount: number;
  feeAmount: number;
  hoursBefore: number;
  status: AppointmentRefundStatus;
  comment: string | null;
  refundedAt: Date | null;
  createdAt: Date;
}

export const toRefundDto = (refund: AppointmentRefund): AppointmentRefundDto => ({
  id: refund.id,
  appointmentId: refund.appointmentId,
  paidAmount: refund.paidAmount,
  refundPercent: refund.refundPercent,
  amount: refund.amount,
  feeAmount: refund.feeAmount,
  hoursBefore: refund.hoursBefore,
  status: refund.status,
  comment: refund.comment,
  refundedAt: refund.refundedAt,
  createdAt: refund.createdAt,
});

const settle = async (
  refundId: string,
  data: Prisma.AppointmentRefundUpdateInput
): Promise<AppointmentRefundStatus> => {
  const updated = await prismaClient.appointmentRefund.update({
    where: { id: refundId },
    data,
  });

  return updated.status;
};

/**
 * Отправляет возврат в FreedomPay и записывает, чем это кончилось.
 *
 * Никогда не бросает: приём уже отменён и в МИС, и у нас, а деньги пациенту должны в любом
 * случае — потерять эту строку из-за исключения нельзя. Все исходы, включая отказ провайдера,
 * сохраняются в самой строке: `COMPLETED` — деньги пошли обратно, `FAILED` — нужен оператор,
 * `PENDING` — провайдер взял возврат в обработку либо мы его ещё не спрашивали.
 *
 * Вызов провайдера сознательно **не повторяется**: у `revoke.php` нет ключа идемпотентности,
 * а частичные возвраты по одному платежу суммируются, поэтому повтор успевшего пройти
 * возврата вернёт деньги второй раз. Всё, что осталось непонятным, оставляется оператору —
 * это восстановимая сторона.
 */
export const processAppointmentRefund = async (
  refundId: string
): Promise<AppointmentRefundStatus> => {
  const refund = await prismaClient.appointmentRefund.findUnique({
    where: { id: refundId },
    include: { payment: { select: { pgPaymentId: true } } },
  });

  if (!refund) {
    refundLogger.warn({ refundId }, 'Refund disappeared before it could be processed');
    return AppointmentRefundStatus.FAILED;
  }

  // Уже проведён или уже провален — второй раз в FreedomPay не идём.
  if (refund.status !== AppointmentRefundStatus.PENDING) {
    refundLogger.info(
      { refundId, status: refund.status },
      'Refund is no longer pending, leaving it alone'
    );
    return refund.status;
  }

  if (!config.appointmentCancellation.refundEnabled) {
    refundLogger.warn(
      { refundId, amount: refund.amount },
      'Automatic refunds are disabled, refund is waiting for an operator'
    );
    return AppointmentRefundStatus.PENDING;
  }

  // Возможно только при удержании 100%: возвращать нечего, и дёргать провайдера незачем.
  if (refund.amount <= 0) {
    return settle(refundId, {
      status: AppointmentRefundStatus.COMPLETED,
      refundedAt: new Date(),
      comment: 'Возврат не полагается: удержана вся сумма приёма',
    });
  }

  if (!refund.payment.pgPaymentId) {
    refundLogger.error(
      { refundId, paymentId: refund.paymentId },
      'Payment has no FreedomPay transaction id, refund cannot be sent'
    );

    return settle(refundId, {
      status: AppointmentRefundStatus.FAILED,
      comment: 'У платежа нет pg_payment_id — возврат нужно провести из кабинета мерчанта',
    });
  }

  let outcome: paymentService.RefundOutcome;
  try {
    outcome = await paymentService.refundPayment({
      pgPaymentId: refund.payment.pgPaymentId,
      amount: refund.amount,
    });
  } catch (error) {
    // Провайдер недоступен или ответил нечитаемо: мы не знаем, прошёл возврат или нет,
    // поэтому не повторяем — разбирается оператор по кабинету мерчанта.
    refundLogger.error(
      { err: error, refundId, paymentId: refund.paymentId, amount: refund.amount },
      'FreedomPay refund request failed'
    );

    return settle(refundId, {
      status: AppointmentRefundStatus.FAILED,
      comment: `Не удалось получить ответ FreedomPay: ${String(
        (error as Error)?.message || error
      ).slice(0, 300)}`,
    });
  }

  if (outcome.result === 'accepted') {
    refundLogger.info(
      { refundId, amount: refund.amount, reference: outcome.reference },
      'Appointment refund accepted by FreedomPay'
    );

    const status = await settle(refundId, {
      status: AppointmentRefundStatus.COMPLETED,
      refundedAt: new Date(),
      externalRef: outcome.reference,
      comment: null,
    });

    auditLogService.log({
      event: AuditEvent.APPOINTMENT_REFUND_PROCESSED,
      success: true,
      userId: refund.userId,
      metadata: {
        refundId,
        appointmentId: refund.appointmentId,
        paymentId: refund.paymentId,
        amount: refund.amount,
        refundPercent: refund.refundPercent,
      },
    });

    return status;
  }

  if (outcome.result === 'pending') {
    // Возврат провайдером принят, но не завершён. Строка остаётся PENDING — повторять
    // нельзя, а оператор увидит её в очереди дашборда и подтвердит по кабинету.
    refundLogger.warn(
      { refundId, amount: refund.amount, description: outcome.description },
      'FreedomPay took the refund but has not completed it'
    );

    return settle(refundId, {
      externalRef: outcome.reference,
      comment: `FreedomPay обрабатывает возврат: ${outcome.description}`.slice(0, 300),
    });
  }

  refundLogger.error(
    {
      refundId,
      paymentId: refund.paymentId,
      amount: refund.amount,
      errorCode: outcome.errorCode,
      description: outcome.description,
    },
    'FreedomPay refused the appointment refund'
  );

  const status = await settle(refundId, {
    status: AppointmentRefundStatus.FAILED,
    comment: `FreedomPay отказал в возврате: ${outcome.description}`.slice(0, 300),
  });

  auditLogService.log({
    event: AuditEvent.APPOINTMENT_REFUND_PROCESSED,
    success: false,
    userId: refund.userId,
    metadata: {
      refundId,
      appointmentId: refund.appointmentId,
      paymentId: refund.paymentId,
      amount: refund.amount,
      errorCode: outcome.errorCode,
      description: outcome.description,
    },
  });

  return status;
};

/* -------------------------------------------------------------------------- */
/*                              Очередь дашборда                               */
/* -------------------------------------------------------------------------- */

/** Строка очереди возвратов плюс то, кому и за какой приём мы должны. */
export interface AppointmentRefundAdminDto extends AppointmentRefundDto {
  userId: string;
  paymentId: string;
  externalRef: string | null;
  updatedAt: Date;
  appointmentAt: Date;
  patientName: string | null;
  patientIin: string | null;
  patientPhone: string;
}

export interface AdminRefundListParams {
  page: number;
  limit: number;
  search?: string | undefined;
  status?: AppointmentRefundStatus | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
}

const endOfDay = (date: string): Date => {
  const parsed = new Date(date);
  parsed.setHours(23, 59, 59, 999);
  return parsed;
};

/**
 * Очередь возвратов для дашборда.
 *
 * Оператору она нужна не для красоты: `FAILED` здесь означает, что деньги с пациента взяты,
 * приём снят, а возврат не прошёл — и провести его придётся руками из кабинета мерчанта.
 */
export const getAdminRefunds = async ({
  page,
  limit,
  search,
  status,
  dateFrom,
  dateTo,
}: AdminRefundListParams) => {
  const where: Prisma.AppointmentRefundWhereInput = {};

  if (status) where.status = status;

  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      // `dateTo` — это день целиком, иначе возврат, созданный в 14:00, выпал бы из
      // диапазона, заканчивающегося его же датой.
      ...(dateTo ? { lte: endOfDay(dateTo) } : {}),
    };
  }

  if (search) {
    where.OR = [
      { user: { phone: { contains: search, mode: 'insensitive' } } },
      { user: { patient: { fullName: { contains: search, mode: 'insensitive' } } } },
      { user: { patient: { iin: { contains: search } } } },
    ];
  }

  const [total, rows, totals] = await Promise.all([
    prismaClient.appointmentRefund.count({ where }),
    prismaClient.appointmentRefund.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        appointment: { select: { dateTime: true } },
        user: { select: { phone: true, patient: { select: { fullName: true, iin: true } } } },
      },
    }),
    // Сумма считается по всей выборке, а не по странице: дашборд показывает её в шапке
    // как «сколько мы должны по текущему фильтру».
    prismaClient.appointmentRefund.aggregate({ where, _sum: { amount: true } }),
  ]);

  const items: AppointmentRefundAdminDto[] = rows.map(({ user, appointment, ...refund }) => ({
    ...toRefundDto(refund),
    userId: refund.userId,
    paymentId: refund.paymentId,
    externalRef: refund.externalRef,
    updatedAt: refund.updatedAt,
    appointmentAt: appointment.dateTime,
    patientName: user.patient?.fullName ?? null,
    patientIin: user.patient?.iin ?? null,
    patientPhone: user.phone,
  }));

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    totalAmount: totals._sum.amount ?? 0,
  };
};

/** Только то, чем распоряжается оператор — сумма принадлежит платежу и неизменна. */
export interface UpdateAppointmentRefundBody {
  status?: AppointmentRefundStatus;
  comment?: string | null;
}

/**
 * Отмечает возврат, проведённый оператором вручную, или оставляет к нему заметку.
 *
 * `refundedAt` следует за статусом, а не редактируется отдельно: это момент, когда деньги
 * ушли обратно, и разойтись со статусом он не должен — иначе очередь начнёт врать о том,
 * что на самом деле проведено.
 *
 * Провайдера этот путь не трогает вообще. Оператор возвращает деньги в кабинете мерчанта и
 * приводит нашу строку в соответствие; попытка «дослать» возврат отсюда была бы вторым
 * вызовом `revoke.php` по тому же платежу, то есть вторым возвратом.
 */
export const updateRefund = async (
  id: string,
  body: UpdateAppointmentRefundBody
): Promise<{ refund: AppointmentRefundDto; previousStatus: AppointmentRefundStatus }> => {
  const existing = await prismaClient.appointmentRefund.findUnique({ where: { id } });

  if (!existing) {
    throw new AppError(ErrorCodes.APPOINTMENT_REFUND_NOT_FOUND, 404);
  }

  const data: Prisma.AppointmentRefundUpdateInput = {};

  if (body.comment !== undefined) data.comment = body.comment;

  if (body.status !== undefined && body.status !== existing.status) {
    data.status = body.status;
    data.refundedAt = body.status === AppointmentRefundStatus.COMPLETED ? new Date() : null;
  }

  const updated = await prismaClient.appointmentRefund.update({ where: { id }, data });

  return { refund: toRefundDto(updated), previousStatus: existing.status };
};
