import { FiscalReceiptStatus, Prisma } from '@prisma/client';

import { prismaClient } from '@/infrastructure/db';
import { ErrorCodes } from '@/shared/constants/error-codes';
import { createLogger } from '@/shared/lib/logger';
import { AppError } from '@/shared/services/app-error.service';
import { enqueueShiftClose, getWebkassaQueueEvents } from '@/shared/queues/webkassa.queue';

import type {
  AdminFiscalReceiptListParams,
  FiscalReceiptAdminDetailDto,
  FiscalReceiptAdminDto,
  ShiftCloseResponse,
} from './fiscal.dto';
import { enqueueReceiptSafely, getWebkassaBlocker } from './fiscal.service';

/**
 * Очередь чеков для дашборда.
 *
 * `FAILED` здесь — деньги получены (или возвращены), а фискального чека на них нет; его
 * нужно повторить отсюда или пробить вручную в кабинете Webkassa.
 */

const adminLogger = createLogger('fiscal-admin');

/** Сколько ручной Z-отчёт ждёт своей очереди и ответа Webkassa. */
const SHIFT_CLOSE_WAIT_MS = 30_000;

const CASHBOX_UTC_OFFSET = '+05:00';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const adminInclude = {
  payment: { select: { purpose: true, pgPaymentId: true } },
  user: { select: { phone: true, patient: { select: { fullName: true, iin: true } } } },
} as const;

type AdminRow = Prisma.FiscalReceiptGetPayload<{ include: typeof adminInclude }>;

const toAdminDto = ({
  payment,
  user,
  positions: _positions,
  ...receipt
}: AdminRow): FiscalReceiptAdminDto => ({
  ...receipt,
  purpose: payment.purpose,
  pgPaymentId: payment.pgPaymentId,
  patientName: user.patient?.fullName ?? null,
  patientIin: user.patient?.iin ?? null,
  patientPhone: user.phone,
});

const toDetailDto = (row: AdminRow): FiscalReceiptAdminDetailDto => ({
  ...toAdminDto(row),
  positions: row.positions,
});

export const getAdminReceipts = async ({
  page,
  limit,
  status,
  operationType,
  dateFrom,
  dateTo,
  search,
}: AdminFiscalReceiptListParams) => {
  const where: Prisma.FiscalReceiptWhereInput = {};

  if (status) where.status = status;
  if (operationType) where.operationType = operationType;

  if (dateFrom || dateTo) {
    // Дни — кассовые (Asia/Almaty), иначе вечерний чек выпал бы из своего дня на UTC-сервере.
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00.000${CASHBOX_UTC_OFFSET}`) } : {}),
      ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999${CASHBOX_UTC_OFFSET}`) } : {}),
    };
  }

  if (search) {
    where.OR = [
      { user: { phone: { contains: search, mode: 'insensitive' } } },
      { user: { patient: { fullName: { contains: search, mode: 'insensitive' } } } },
      { user: { patient: { iin: { contains: search } } } },
      { payment: { pgPaymentId: { contains: search } } },
      { checkNumber: { contains: search } },
      { externalCheckNumber: search },
      // uuid-колонки сравниваются только с валидным uuid, иначе Postgres отвергнет запрос.
      ...(UUID_PATTERN.test(search) ? [{ paymentId: search }, { id: search }] : []),
    ];
  }

  const [total, rows, totals] = await Promise.all([
    prismaClient.fiscalReceipt.count({ where }),
    prismaClient.fiscalReceipt.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: adminInclude,
    }),
    // По всей выборке, а не по странице: дашборд показывает это в шапке.
    prismaClient.fiscalReceipt.aggregate({ where, _sum: { amount: true } }),
  ]);

  return {
    items: rows.map(toAdminDto),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    totalAmount: totals._sum.amount ?? 0,
  };
};

export const getAdminReceiptById = async (id: string): Promise<FiscalReceiptAdminDetailDto> => {
  const row = await prismaClient.fiscalReceipt.findUnique({ where: { id }, include: adminInclude });

  if (!row) throw new AppError(ErrorCodes.FISCAL_RECEIPT_NOT_FOUND, 404);

  return toDetailDto(row);
};

/**
 * Ручной повтор FAILED-чека: снова PENDING, счётчик попыток с нуля, новая задача.
 *
 * Только из FAILED — повтор PENDING-чека дал бы вторую задачу на тот же чек, пока первая
 * ещё в очереди. Переход условный, так что двойное нажатие выигрывает один раз.
 */
export const retryReceipt = async (
  id: string
): Promise<{ receipt: FiscalReceiptAdminDetailDto; previousError: string | null }> => {
  const existing = await prismaClient.fiscalReceipt.findUnique({ where: { id } });

  if (!existing) throw new AppError(ErrorCodes.FISCAL_RECEIPT_NOT_FOUND, 404);

  const { count } = await prismaClient.fiscalReceipt.updateMany({
    where: { id, status: FiscalReceiptStatus.FAILED },
    data: {
      status: FiscalReceiptStatus.PENDING,
      attempts: 0,
      retryRound: { increment: 1 },
    },
  });

  if (count === 0) throw new AppError(ErrorCodes.FISCAL_RECEIPT_NOT_RETRYABLE, 409);

  const receipt = await getAdminReceiptById(id);

  await enqueueReceiptSafely(id, receipt.retryRound);

  adminLogger.info(
    { receiptId: id, paymentId: receipt.paymentId, retryRound: receipt.retryRound },
    'Fiscal receipt retried by an operator'
  );

  return { receipt, previousError: existing.lastError };
};

/**
 * Ручной Z-отчёт — через ту же очередь, что и чеки (запросы по кассе строго
 * последовательны), с ожиданием результата до 30 секунд.
 */
export const closeShiftManually = async (): Promise<ShiftCloseResponse> => {
  if (getWebkassaBlocker()) throw new AppError(ErrorCodes.WEBKASSA_DISABLED, 409);

  const queueEvents = getWebkassaQueueEvents();
  await queueEvents.waitUntilReady();

  const job = await enqueueShiftClose();

  try {
    const result = (await job.waitUntilFinished(
      queueEvents,
      SHIFT_CLOSE_WAIT_MS
    )) as ShiftCloseResponse;
    return { closed: Boolean(result?.closed), shiftNumber: result?.shiftNumber ?? null };
  } catch (error) {
    adminLogger.error({ err: error, jobId: job.id }, 'Manual Z-report did not complete');
    throw new AppError(ErrorCodes.WEBKASSA_UNAVAILABLE, 502);
  }
};
