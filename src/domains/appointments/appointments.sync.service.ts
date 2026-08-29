import { AppointmentStatus, Prisma } from '@prisma/client';

import * as misService from '@/domains/mis/mis.service';
import { config } from '@/config';
import { prismaClient } from '@/infrastructure/db';
import { createLogger } from '@/shared/lib/logger';
import * as auditLogService from '@/shared/services/audit-log.service';
import { AuditEvent } from '@/shared/services/audit-log.service';
import {
  cancelAppointmentNotification,
  scheduleAppointmentNotification,
} from '@/shared/queues/notification.queue';

/**
 * Статусы приёма живут в МИС, и колбэка об их изменении оттуда не приходит: врач закрывает
 * визит, регистратура отменяет запись — а наша строка остаётся `SCHEDULED` навсегда.
 * Мобильное приложение это скрывает, потому что список тянется из МИС напрямую, но панель
 * администратора читает наши таблицы и показывает устаревшую очередь.
 *
 * Здесь фоновый проход, который спрашивает МИС сам. Опрос идёт **по пациенту**, а не по
 * приёму: один запрос отдаёт все записи бенефициара, поэтому день приёмов — это единицы
 * запросов, а не десятки.
 *
 * Файл отдельный от `appointments.service` по той же причине, что и
 * `appointments.admin.service`: ему нужен `mis.service`, а `mis.service` уже импортирует
 * `appointments.service` ради правил конфликтов — импорт оттуда замкнул бы цикл.
 */

const syncLogger = createLogger('appointments-sync');

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Словарь статусов МИС. Своих состояний у МИС больше трёх, поэтому неизвестная строка —
 * это не ошибка: она пишется в `misStatus`, наш `status` остаётся прежним, а строка
 * попадает в лог, чтобы её можно было добавить сюда осознанно.
 */
const MIS_STATUS_MAP: Record<string, AppointmentStatus> = {
  scheduled: AppointmentStatus.SCHEDULED,
  confirmed: AppointmentStatus.SCHEDULED,
  approved: AppointmentStatus.SCHEDULED,
  pending: AppointmentStatus.SCHEDULED,
  new: AppointmentStatus.SCHEDULED,
  in_progress: AppointmentStatus.SCHEDULED,
  completed: AppointmentStatus.COMPLETED,
  finished: AppointmentStatus.COMPLETED,
  done: AppointmentStatus.COMPLETED,
  cancelled: AppointmentStatus.CANCELLED,
  canceled: AppointmentStatus.CANCELLED,
  rejected: AppointmentStatus.CANCELLED,
  declined: AppointmentStatus.CANCELLED,
  no_show: AppointmentStatus.CANCELLED,
  archived: AppointmentStatus.CANCELLED,
};

export const mapMisStatus = (misStatus: string | null | undefined): AppointmentStatus | null => {
  if (!misStatus) return null;

  return MIS_STATUS_MAP[misStatus.trim().toLowerCase()] ?? null;
};

export interface AppointmentSyncResult {
  /** Локальных приёмов, попавших в проход. */
  checked: number;
  /** Пациентов МИС, которых опросили. */
  patients: number;
  /** Из них попавших в проход из-за близкого визита. */
  hotPatients: number;
  /** Из них добранных из дальних записей на остаток бюджета. */
  coldPatients: number;
  /** Приёмов, у которых статус действительно изменился. */
  updated: number;
  /** Приёмов, которых МИС не показал ни в записях, ни в заявках. */
  notFound: number;
  /** Пациентов, по которым МИС не ответил: их приёмы остались нетронутыми. */
  failedPatients: number;
}

type SyncCandidate = {
  id: string;
  userId: string;
  patientId: string;
  externalId: string;
  dateTime: Date;
  status: AppointmentStatus;
  misStatus: string | null;
};

/**
 * Собирает статусы всех приёмов пациента в МИС.
 *
 * Смотрим два списка, потому что при записи мы сохраняем в `externalId` то, что вернул МИС:
 * id заявки (`request`), если запись прошла через заявку, и id приёма (`appointment`) в
 * остальных случаях. Заявка после одобрения ещё и ссылается на созданный приём, поэтому её
 * `appointment_id` тоже кладём в словарь — иначе одобренная заявка так и висела бы
 * ненайденной.
 */
const readMisStatuses = async (misPatientId: string): Promise<Map<string, string>> => {
  const statuses = new Map<string, string>();

  const [appointments, requests] = await Promise.all([
    misService.getAppointments(misPatientId),
    misService.getAppointmentRequests(misPatientId, { includePast: true }),
  ]);

  // Заявки кладём первыми: если по одному и тому же id есть и заявка, и приём, правда —
  // за приёмом, он и перезапишет значение.
  for (const request of requests || []) {
    if (!request?.status) continue;

    if (request.id) statuses.set(request.id, request.status);
    if (request.appointment_id) statuses.set(request.appointment_id, request.status);
  }

  for (const appointment of appointments || []) {
    if (appointment?.id && appointment.status) statuses.set(appointment.id, appointment.status);
  }

  return statuses;
};

/**
 * Переносит новый статус в базу и приводит в порядок напоминания: отменённый или уже
 * закрытый приём не должен присылать «через час у вас приём».
 */
const applyStatus = async (
  appointment: SyncCandidate,
  status: AppointmentStatus,
  misStatus: string
) => {
  await prismaClient.appointment.update({
    where: { id: appointment.id },
    data: { status, misStatus, statusSyncedAt: new Date() },
  });

  syncLogger.info(
    {
      appointmentId: appointment.id,
      externalId: appointment.externalId,
      from: appointment.status,
      to: status,
      misStatus,
    },
    'Appointment status updated from MIS'
  );

  void auditLogService.log({
    event: AuditEvent.APPOINTMENT_STATUS_SYNCED,
    success: true,
    userId: appointment.userId,
    metadata: {
      appointmentId: appointment.id,
      externalId: appointment.externalId,
      from: appointment.status,
      to: status,
      misStatus,
      source: 'mis-sync',
    },
  });

  try {
    if (status === AppointmentStatus.SCHEDULED) {
      await scheduleAppointmentNotification(
        appointment.id,
        appointment.userId,
        appointment.dateTime
      );
    } else {
      await cancelAppointmentNotification(appointment.id);
    }
  } catch (error) {
    // Напоминание — не причина терять актуальный статус, он уже записан.
    syncLogger.error(
      { err: error, appointmentId: appointment.id, status },
      'Failed to update appointment notifications after status sync'
    );
  }
};

/**
 * Один проход синхронизации.
 *
 * Очередь делится по близости визита, иначе запись на три месяца вперёд занимала бы место
 * наравне с завтрашней и растягивала полный обход на сутки:
 *
 * - «горячие» — приёмы от `lookbackDays` назад до `hotHorizonHours` вперёд. Сверяются каждый
 *   проход. Границу задают напоминания: они уходят за 3 часа до визита, и отмена должна быть
 *   известна раньше, иначе пуш придёт на отменённый приём.
 * - «холодные» — всё, что дальше горизонта. Берутся только если остался бюджет и с прошлой
 *   сверки прошло больше `coldIntervalHours`. Такой записи ещё неделю нечего менять, а
 *   переехать в горячую очередь она успеет сама, когда до неё останется меньше горизонта.
 *
 * Внутри каждой группы первыми идут те, у кого дольше всех не было сверки. Недоступность МИС
 * по одному пациенту не роняет проход: его приёмы остаются со старым `statusSyncedAt` и
 * попадут в начало следующей выборки.
 */
/**
 * Сколько приёмов на пациента закладываем в выборку. Занижение не теряет данные: остаток
 * попадёт в следующий проход, потому что `statusSyncedAt` у него так и останется старым.
 */
const CANDIDATES_PER_PATIENT = 20;

export const syncAppointmentStatuses = async (): Promise<AppointmentSyncResult> => {
  const { batchSize, requestSpacingMs, lookbackDays, hotHorizonHours, coldIntervalHours } =
    config.mis.appointmentSync;
  const now = Date.now();
  const notBefore = new Date(now - lookbackDays * 24 * 60 * 60 * 1000);
  const horizon = new Date(now + hotHorizonHours * 60 * 60 * 1000);
  const coldStaleBefore = new Date(now - coldIntervalHours * 60 * 60 * 1000);

  const select = {
    id: true,
    userId: true,
    patientId: true,
    externalId: true,
    dateTime: true,
    status: true,
    misStatus: true,
  } as const;

  // Никогда не сверявшиеся идут первыми, дальше — самые давние: за несколько проходов
  // очередь обходится целиком, и ни один приём не остаётся без внимания.
  const orderBy = [
    { statusSyncedAt: { sort: 'asc', nulls: 'first' } },
    { dateTime: 'asc' },
  ] satisfies Prisma.AppointmentOrderByWithRelationInput[];

  // Верхняя граница выборки: опрашиваем всё равно не больше `batchSize` пациентов, а
  // сортировка гарантирует, что в срез попадают самые несвежие строки.
  const take = batchSize * CANDIDATES_PER_PATIENT;

  const [hot, cold] = await Promise.all([
    prismaClient.appointment.findMany({
      where: {
        status: AppointmentStatus.SCHEDULED,
        dateTime: { gte: notBefore, lte: horizon },
      },
      select,
      orderBy,
      take,
    }),
    prismaClient.appointment.findMany({
      where: {
        status: AppointmentStatus.SCHEDULED,
        dateTime: { gt: horizon },
        // Дальние записи, сверенные недавно, в проход не берём вовсе — это и есть то, что
        // не даёт им вытеснять ближайшие визиты из бюджета.
        OR: [{ statusSyncedAt: null }, { statusSyncedAt: { lt: coldStaleBefore } }],
      },
      select,
      orderBy,
      take,
    }),
  ]);

  // Горячие первыми, поэтому бюджет достаётся им, а холодные забирают только остаток.
  const byPatient = new Map<string, SyncCandidate[]>();
  const hotPatients = new Set<string>();

  for (const appointment of hot) {
    const group = byPatient.get(appointment.patientId);
    if (group) {
      group.push(appointment);
    } else {
      byPatient.set(appointment.patientId, [appointment]);
      hotPatients.add(appointment.patientId);
    }
  }

  for (const appointment of cold) {
    const group = byPatient.get(appointment.patientId);
    // Дальняя запись пациента, которого мы и так опрашиваем, идёт довеском: его статусы
    // приезжают из МИС одним ответом, отдельного запроса она не стоит.
    if (group) {
      group.push(appointment);
      continue;
    }

    byPatient.set(appointment.patientId, [appointment]);
  }

  // Порядок вставки сохраняется в Map, поэтому срез — это ровно самые приоритетные пациенты.
  const patients = [...byPatient.entries()].slice(0, batchSize);

  const result: AppointmentSyncResult = {
    checked: 0,
    patients: patients.length,
    hotPatients: patients.filter(([misPatientId]) => hotPatients.has(misPatientId)).length,
    coldPatients: patients.filter(([misPatientId]) => !hotPatients.has(misPatientId)).length,
    updated: 0,
    notFound: 0,
    failedPatients: 0,
  };

  for (const [index, [misPatientId, appointments]] of patients.entries()) {
    if (index > 0 && requestSpacingMs > 0) await sleep(requestSpacingMs);

    let statuses: Map<string, string>;

    try {
      statuses = await readMisStatuses(misPatientId);
    } catch (error) {
      // Один недоступный пациент не должен обрывать проход.
      result.failedPatients += 1;
      syncLogger.warn({ err: error, misPatientId }, 'Failed to read appointment statuses from MIS');
      continue;
    }

    for (const appointment of appointments) {
      result.checked += 1;

      const misStatus = statuses.get(appointment.externalId);

      if (!misStatus) {
        // Пропавшую из МИС запись не трогаем: удаление записи в МИС и молчание отличить
        // нельзя, а «отменить на всякий случай» — это отменить живой приём.
        result.notFound += 1;
        syncLogger.warn(
          { appointmentId: appointment.id, externalId: appointment.externalId, misPatientId },
          'Appointment not found in MIS'
        );
        continue;
      }

      const status = mapMisStatus(misStatus);

      if (!status) {
        syncLogger.warn(
          { appointmentId: appointment.id, misStatus },
          'Unknown MIS appointment status, local status left as is'
        );
      }

      if (!status || status === appointment.status) {
        // Статус не изменился — отмечаем только факт сверки (и сырой статус МИС, он мог
        // сдвинуться внутри нашего `SCHEDULED`, например на `in_progress`).
        await prismaClient.appointment.update({
          where: { id: appointment.id },
          data: { misStatus, statusSyncedAt: new Date() },
        });
        continue;
      }

      await applyStatus(appointment, status, misStatus);
      result.updated += 1;
    }
  }

  return result;
};
