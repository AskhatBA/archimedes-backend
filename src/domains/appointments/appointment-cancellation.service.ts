import { Appointment, AppointmentRefund, AppointmentStatus } from '@prisma/client';

import * as misService from '@/domains/mis/mis.service';
import * as patientService from '@/domains/patient/patient.service';
import { prismaClient } from '@/infrastructure/db';
import { ErrorCodes } from '@/shared/constants/error-codes';
import { createLogger } from '@/shared/lib/logger';
import { enqueueAppointmentRefund } from '@/shared/queues/appointment-refund.queue';
import { cancelAppointmentNotification } from '@/shared/queues/notification.queue';
import { AppError } from '@/shared/services/app-error.service';
import * as auditLogService from '@/shared/services/audit-log.service';
import { AuditEvent } from '@/shared/services/audit-log.service';

import { resolveAppointmentPayment } from './appointment-payment.service';
import {
  AppointmentRefundDto,
  planRefund,
  RefundPlan,
  toRefundDto,
} from './appointment-refund.service';

/**
 * Отмена приёма пациентом.
 *
 * Приём живёт в МИС, поэтому отмена — это прежде всего запрос туда, и только после его
 * успеха меняется наша строка. Что делать дальше, решает не тип записи в МИС, а наличие
 * нашего платежа: приём по программе оплачен страховой и возвращать нечего, платный —
 * возвращается через FreedomPay, полностью или за вычетом компенсации за позднюю отмену.
 *
 * Файл отдельный от `appointments.service` по той же причине, что `appointments.admin.service`
 * и `appointments.sync.service`: ему нужен `mis.service`, а тот уже импортирует
 * `appointments.service` ради правил конфликтов — импорт оттуда замкнул бы цикл.
 */

const cancellationLogger = createLogger('appointment-cancellation');

type CancellableAppointment = Pick<
  Appointment,
  'id' | 'userId' | 'patientId' | 'doctorId' | 'externalId' | 'dateTime' | 'status' | 'paymentId'
>;

const APPOINTMENT_SELECT = {
  id: true,
  userId: true,
  patientId: true,
  doctorId: true,
  externalId: true,
  dateTime: true,
  status: true,
  paymentId: true,
} as const;

/**
 * Достраивает поиск через МИС, когда клиент назвал приём id, которого у нас нет.
 *
 * При бронировании в `externalId` ложится то, что вернул МИС, а возвращает он **заявку**.
 * Приложение же показывает историю приёмов (`/mis/appointment-history`), где у той же
 * записи уже id **приёма** — то есть самый обычный путь отмены приходит с id, по которому
 * наша строка не находится. Одобренная заявка ссылается на созданный приём через
 * `appointment_id`, и это единственное, что связывает два идентификатора; сверка статусов
 * читает тот же список по той же причине.
 *
 * `null`, если МИС не ответил или такой заявки нет: тогда наверху это обычный 404.
 */
const findRequestIdByMisAppointmentId = async (
  misAppointmentId: string,
  userId: string
): Promise<string | null> => {
  try {
    const patient = await patientService.getPatientById(userId);
    if (!patient?.misPatientId) return null;

    const requests = await misService.getAppointmentRequests(patient.misPatientId, {
      includePast: true,
    });

    return (
      (requests || []).find((request) => request?.appointment_id === misAppointmentId)?.id ?? null
    );
  } catch (error) {
    cancellationLogger.warn(
      { err: error, misAppointmentId, userId },
      'Could not ask MIS which request this appointment came from'
    );

    return null;
  }
};

/**
 * Находит приём пациента по нашему id или по id записи в МИС.
 *
 * Оба варианта нужны, потому что списки в приложении проксируются из МИС напрямую и на
 * руках у клиента оказывается МИС-овский идентификатор, а дашборд и наши же ответы
 * оперируют нашим uuid. Третий случай — id приёма против сохранённого id заявки — стоит
 * одного запроса в МИС и разбирается в `findRequestIdByMisAppointmentId`.
 */
const findOwnAppointment = async (
  idOrExternalId: string,
  userId: string
): Promise<CancellableAppointment> => {
  const byOwnId = { userId, OR: [{ id: idOrExternalId }, { externalId: idOrExternalId }] };

  const appointment = await prismaClient.appointment.findFirst({
    where: byOwnId,
    select: APPOINTMENT_SELECT,
  });

  if (appointment) return appointment;

  const requestId = await findRequestIdByMisAppointmentId(idOrExternalId, userId);

  const byRequestId = requestId
    ? await prismaClient.appointment.findFirst({
        where: { userId, externalId: requestId },
        select: APPOINTMENT_SELECT,
      })
    : null;

  if (!byRequestId) {
    throw new AppError(ErrorCodes.APPOINTMENT_NOT_FOUND, 404);
  }

  return byRequestId;
};

/** Отменять можно только предстоящий запланированный приём. */
const assertCancellable = (appointment: CancellableAppointment, now: Date): void => {
  if (appointment.status !== AppointmentStatus.SCHEDULED) {
    throw new AppError(ErrorCodes.APPOINTMENT_NOT_CANCELLABLE, 409);
  }

  // Начавшийся или прошедший приём снимает регистратура: иначе за состоявшийся визит можно
  // было бы получить назад деньги.
  if (appointment.dateTime.getTime() <= now.getTime()) {
    throw new AppError(ErrorCodes.APPOINTMENT_ALREADY_STARTED, 409);
  }
};

export interface CancellationPreview {
  appointmentId: string;
  externalId: string;
  dateTime: Date;
  /** За приём платили картой, значит отмена влечёт возврат. */
  isPaid: boolean;
  /** Всё, что известно про деньги, — `null` для приёма по программе. */
  refund: RefundPlan | null;
}

/**
 * Что будет, если отменить приём прямо сейчас.
 *
 * Приложение показывает это до подтверждения: «вернётся 70%» пациент должен увидеть до
 * нажатия, а не узнать по факту. Ничего не меняет и в МИС не ходит.
 */
export const getCancellationPreview = async (
  idOrExternalId: string,
  userId: string
): Promise<CancellationPreview> => {
  const now = new Date();
  const appointment = await findOwnAppointment(idOrExternalId, userId);

  assertCancellable(appointment, now);

  const payment = await resolveAppointmentPayment(appointment);

  return {
    appointmentId: appointment.id,
    externalId: appointment.externalId,
    dateTime: appointment.dateTime,
    isPaid: payment !== null,
    refund: payment
      ? planRefund({ paidAmount: payment.amount, appointmentAt: appointment.dateTime, now })
      : null,
  };
};

/**
 * Снимает запись в МИС.
 *
 * Ошибка отсюда пробрасывается наружу, и это осознанно: локальная отмена и тем более
 * возврат денег за приём, который в МИС остался, хуже, чем неудачная отмена. Если запись
 * там уже удалена, наша строка всё равно догонит статус — фоновая сверка с МИС переведёт
 * её в CANCELLED сама.
 *
 * В путь идёт `patientId` приёма, а не бенефициар аккаунта: при записи родственника это его
 * id, и именно по нему МИС отдаёт заявку — так же, как её читает сверка статусов.
 */
const cancelInMis = async (appointment: CancellableAppointment): Promise<void> => {
  await misService.removeAppointmentRequest(appointment.patientId, appointment.externalId);

  cancellationLogger.info(
    { appointmentId: appointment.id, externalId: appointment.externalId },
    'Appointment request cancelled in MIS'
  );
};

export interface CancellationResult {
  appointmentId: string;
  externalId: string;
  dateTime: Date;
  status: AppointmentStatus;
  /** Возврат, если приём был платным. `null` — приём по программе. */
  refund: AppointmentRefundDto | null;
}

/**
 * Отменяет приём и, если он был платным, ставит возврат в очередь.
 *
 * Порядок неслучаен. Сначала МИС — пока запись там жива, отменять и возвращать нечего.
 * Потом одной транзакцией статус приёма и строка возврата: условие `status = SCHEDULED` в
 * обновлении означает, что при двойном нажатии возврат создаст только победитель, а
 * уникальный `appointmentId` строки возврата закрывает даже это. И только после
 * коммита — очередь: отправка в FreedomPay внешняя и медленная, а долг перед пациентом уже
 * записан и не потеряется, даже если очередь недоступна.
 */
export const cancelAppointment = async (
  idOrExternalId: string,
  userId: string,
  options: { phone?: string | undefined } = {}
): Promise<CancellationResult> => {
  const now = new Date();
  const appointment = await findOwnAppointment(idOrExternalId, userId);

  assertCancellable(appointment, now);

  const payment = await resolveAppointmentPayment(appointment);
  const plan = payment
    ? planRefund({ paidAmount: payment.amount, appointmentAt: appointment.dateTime, now })
    : null;

  await cancelInMis(appointment);

  const { refund, cancelledHere } = await prismaClient.$transaction(async (tx) => {
    const { count } = await tx.appointment.updateMany({
      where: { id: appointment.id, status: AppointmentStatus.SCHEDULED },
      data: { status: AppointmentStatus.CANCELLED, cancelledAt: now },
    });

    // Приём успели отменить между нашим чтением и записью — параллельным запросом или
    // сверкой с МИС. Возврат по нему уже посчитан, второй раз не считаем: отдаём тот,
    // что есть, и дальше ведём себя как повтор, а не как новая отмена.
    if (count === 0) {
      return {
        refund: await tx.appointmentRefund.findUnique({
          where: { appointmentId: appointment.id },
        }),
        cancelledHere: false,
      };
    }

    if (!payment || !plan) return { refund: null, cancelledHere: true };

    return {
      refund: await tx.appointmentRefund.create({
        data: {
          appointmentId: appointment.id,
          paymentId: payment.id,
          userId: appointment.userId,
          paidAmount: plan.paidAmount,
          refundPercent: plan.refundPercent,
          amount: plan.amount,
          feeAmount: plan.feeAmount,
          hoursBefore: plan.hoursBefore,
        },
      }),
      cancelledHere: true,
    };
  });

  await cancelAppointmentNotification(appointment.id).catch((error) => {
    // Напоминание о снятом приёме — неприятно, но не повод считать отмену неудавшейся.
    cancellationLogger.error(
      { err: error, appointmentId: appointment.id },
      'Failed to cancel appointment reminders'
    );
  });

  cancellationLogger.info(
    {
      appointmentId: appointment.id,
      userId,
      isPaid: payment !== null,
      cancelledHere,
      refundId: refund?.id,
      refundAmount: refund?.amount,
      refundPercent: refund?.refundPercent,
    },
    cancelledHere ? 'Appointment cancelled by patient' : 'Appointment was already cancelled'
  );

  // Только та отмена, что действительно перевела строку, попадает в журнал и в очередь:
  // иначе повтор оставлял бы вторую запись об отмене и вторую — о возникшем долге.
  if (!cancelledHere) {
    return {
      appointmentId: appointment.id,
      externalId: appointment.externalId,
      dateTime: appointment.dateTime,
      status: AppointmentStatus.CANCELLED,
      refund: refund ? toRefundDto(refund) : null,
    };
  }

  auditLogService.log({
    event: AuditEvent.APPOINTMENT_CANCELLED,
    success: true,
    userId,
    phone: options.phone,
    metadata: {
      appointmentId: appointment.id,
      externalId: appointment.externalId,
      dateTime: appointment.dateTime.toISOString(),
      isPaid: payment !== null,
      ...(refund
        ? { refundId: refund.id, refundAmount: refund.amount, refundPercent: refund.refundPercent }
        : {}),
    },
  });

  await queueRefund(refund);

  return {
    appointmentId: appointment.id,
    externalId: appointment.externalId,
    dateTime: appointment.dateTime,
    status: AppointmentStatus.CANCELLED,
    refund: refund ? toRefundDto(refund) : null,
  };
};

/**
 * Отдаёт возврат воркеру.
 *
 * Провал постановки в очередь логируется и глотается: приём уже отменён, строка возврата
 * записана и видна оператору, а уронить отмену из-за недоступного Redis — значит оставить
 * пациента с записью, которую он только что снял в МИС.
 */
const queueRefund = async (refund: AppointmentRefund | null): Promise<void> => {
  if (!refund) return;

  auditLogService.log({
    event: AuditEvent.APPOINTMENT_REFUND_CREATED,
    success: true,
    userId: refund.userId,
    metadata: {
      refundId: refund.id,
      appointmentId: refund.appointmentId,
      paymentId: refund.paymentId,
      paidAmount: refund.paidAmount,
      amount: refund.amount,
      refundPercent: refund.refundPercent,
      hoursBefore: refund.hoursBefore,
    },
  });

  try {
    await enqueueAppointmentRefund(refund.id);
  } catch (error) {
    cancellationLogger.error(
      { err: error, refundId: refund.id },
      'Failed to queue the appointment refund'
    );
  }
};
