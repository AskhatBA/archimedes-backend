import Sentry from '@sentry/node';
import {
  FiscalOperationType,
  FiscalReceipt,
  FiscalReceiptStatus,
  PaymentPurpose,
  Prisma,
} from '@prisma/client';

import { config } from '@/config';
import { prismaClient } from '@/infrastructure/db';
import { createLogger } from '@/shared/lib/logger';
import * as auditLogService from '@/shared/services/audit-log.service';
import { AuditEvent } from '@/shared/services/audit-log.service';
import { enqueueFiscalReceipt } from '@/shared/queues/webkassa.queue';

import {
  AMOUNT_EPSILON,
  PositionDescriptor,
  ReceiptContentSnapshot,
  buildReceiptContent,
  buildSalePositions,
  firstPositionOf,
  toMoney,
} from './fiscal.positions';
import * as webkassaClient from './webkassa.client';
import { WebkassaError, isWebkassaError } from './webkassa.client';
import {
  WEBKASSA_ERROR,
  WEBKASSA_OPERATION,
  WEBKASSA_ROUND_TYPE_NONE,
  WebkassaCheckData,
  WebkassaCheckRequest,
} from './webkassa.types';

/**
 * Фискальные чеки (Webkassa).
 *
 * Чек продажи создаётся строкой `PENDING` в той же транзакции, где платёж становится
 * SUCCESS (`createSaleReceiptInTx`), чек возврата — когда возврат за приём становится
 * COMPLETED (`createReturnReceipt`). Регистрирует их в Webkassa воркер очереди `webkassa`
 * через `issueReceipt`. Ни один исход здесь не влияет на сам платёж или возврат: деньги
 * уже движутся, а чек — следствие, а не условие.
 */

const fiscalLogger = createLogger('fiscal');

/** Время кассы: Казахстан живёт по UTC+5 (то же смещение, что `CLINIC_UTC_OFFSET`). */
const CASHBOX_UTC_OFFSET = '+05:00';
const CASHBOX_UTC_OFFSET_MS = 5 * 3_600_000;

/** Проход-сверка трогает только чеки старше этого — свежие ещё в очереди. */
const SWEEP_MIN_AGE_MS = 2 * 60_000;
const SWEEP_BATCH = 200;

const ERROR_TEXT_MAX = 500;

export const FISCAL_MESSAGES = {
  duplicateWithoutData:
    'Чек уже зарегистрирован, реквизиты не получены — проверьте в кабинете Webkassa',
  saleMissing: 'Нет чека продажи — сначала нужно выпустить его',
  salePending: 'Ждёт выпуска чека продажи',
  saleIncomplete: 'У чека продажи нет реквизитов для возврата (CheckNumber/РНК/время)',
} as const;

/** Транзакционный клиент того же (расширенного) Prisma-клиента. */
export type FiscalTx = Parameters<Parameters<typeof prismaClient.$transaction>[0]>[0];

/**
 * Намеренная ошибка для BullMQ: чек остаётся PENDING, задача повторится с паузой.
 * Всё остальное `issueReceipt` наружу не пробрасывает.
 */
export class FiscalRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FiscalRetryableError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/* -------------------------------------------------------------------------- */
/*                               Готовность кассы                              */
/* -------------------------------------------------------------------------- */

export type WebkassaBlocker =
  | { kind: 'disabled'; reason: string }
  | { kind: 'misconfigured'; reason: string };

const isDevWebkassaUrl = (url: string): boolean => {
  try {
    return new URL(url).hostname.toLowerCase().startsWith('devkkm.');
  } catch {
    return false;
  }
};

/**
 * Почему в Webkassa сейчас нельзя ничего отправлять, или `null`, если можно.
 *
 * Неполный конфиг и «тестовые оплаты в боевую кассу» — `misconfigured` (пишется `error`),
 * выключенный флаг — штатное `disabled`.
 */
export const getWebkassaBlocker = (): WebkassaBlocker | null => {
  const webkassa = config.webkassa;

  if (!webkassa.enabled) return { kind: 'disabled', reason: 'WEBKASSA_ENABLED=false' };

  const missing = (
    [
      ['WEBKASSA_API_KEY', webkassa.apiKey],
      ['WEBKASSA_LOGIN', webkassa.login],
      ['WEBKASSA_PASSWORD', webkassa.password],
      ['WEBKASSA_CASHBOX_UNIQUE_NUMBER', webkassa.cashboxUniqueNumber],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    return { kind: 'misconfigured', reason: `Webkassa is not configured: ${missing.join(', ')}` };
  }

  if (webkassa.taxType !== 0 && !(webkassa.taxPercent > 0)) {
    return {
      kind: 'misconfigured',
      reason: 'WEBKASSA_TAX_PERCENT is required when WEBKASSA_TAX_TYPE is not 0',
    };
  }

  // Тестовые оплаты FreedomPay не должны попадать в боевую кассу.
  if (config.freedomPay.testingMode && !isDevWebkassaUrl(webkassa.apiUrl)) {
    return {
      kind: 'misconfigured',
      reason:
        'FREEDOMPAY_TESTING_MODE=true, but WEBKASSA_API_URL is not the devkkm test server — refusing to fiscalize sandbox payments',
    };
  }

  return null;
};

/** Пишет в лог, почему касса недоступна: `error` для неполного конфига, `info` для флага. */
export const logWebkassaBlocker = (blocker: WebkassaBlocker, fields: object = {}): void => {
  if (blocker.kind === 'misconfigured') {
    fiscalLogger.error(
      { ...fields, reason: blocker.reason },
      'Webkassa is misconfigured, nothing is sent'
    );
  } else {
    fiscalLogger.info(
      { ...fields, reason: blocker.reason },
      'Webkassa is disabled, receipt left PENDING'
    );
  }
};

export const isFiscalizedPurpose = (purpose: PaymentPurpose): boolean =>
  config.webkassa.fiscalizePurposes.includes(purpose);

/* -------------------------------------------------------------------------- */
/*                                Создание строк                               */
/* -------------------------------------------------------------------------- */

/**
 * Строка чека продажи — внутри транзакции `settlePayment`, сразу за условным переходом
 * платежа в SUCCESS. Этот переход выигрывает ровно один вызывающий, поэтому строка
 * появляется ровно один раз; `externalCheckNumber = payment.id` (unique) страхует это и в
 * БД, и в Webkassa.
 *
 * Создаётся при любом `WEBKASSA_ENABLED`. Возвращает id строки или `null`, если назначение
 * не фискализируется.
 */
export const createSaleReceiptInTx = async (
  tx: FiscalTx,
  payment: { id: string; userId: string; amount: number; purpose: PaymentPurpose }
): Promise<string | null> => {
  if (!isFiscalizedPurpose(payment.purpose) || !(payment.amount > 0)) return null;

  const receipt = await tx.fiscalReceipt.create({
    data: {
      paymentId: payment.id,
      userId: payment.userId,
      operationType: FiscalOperationType.SALE,
      externalCheckNumber: payment.id,
      amount: toMoney(payment.amount),
      cashboxUniqueNumber: config.webkassa.cashboxUniqueNumber,
    },
    select: { id: true },
  });

  return receipt.id;
};

/**
 * Ставит чек в очередь, не пробрасывая ошибку: строка уже записана, и проход-сверка
 * подберёт её, если постановка потерялась.
 */
export const enqueueReceiptSafely = async (receiptId: string, retryRound = 0): Promise<void> => {
  try {
    await enqueueFiscalReceipt(receiptId, retryRound);
  } catch (error) {
    fiscalLogger.error(
      { err: error, receiptId },
      'Failed to enqueue fiscal receipt, the sweep will pick it up'
    );
  }
};

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * Чек возврата на возврат за приём, ставший COMPLETED.
 *
 * Идемпотентно: `refundId` и `externalCheckNumber = refund.id` уникальны, так что
 * повторный вызов (оператор дважды сохранил COMPLETED) ничего не создаёт. Возврат без денег
 * (`amount <= 0`, удержано 100%) чека не получает. Никогда не бросает — статус возврата от
 * чека не зависит.
 */
export const createReturnReceipt = async (refund: {
  id: string;
  paymentId: string;
  userId: string;
  amount: number;
}): Promise<string | null> => {
  if (!(refund.amount > 0)) return null;

  let receiptId: string;
  try {
    const receipt = await prismaClient.fiscalReceipt.create({
      data: {
        paymentId: refund.paymentId,
        refundId: refund.id,
        userId: refund.userId,
        operationType: FiscalOperationType.SALE_RETURN,
        externalCheckNumber: refund.id,
        amount: toMoney(refund.amount),
        cashboxUniqueNumber: config.webkassa.cashboxUniqueNumber,
      },
      select: { id: true },
    });
    receiptId = receipt.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      fiscalLogger.info({ refundId: refund.id }, 'Return receipt already exists for this refund');
    } else {
      fiscalLogger.error({ err: error, refundId: refund.id }, 'Failed to create return receipt');
    }
    return null;
  }

  fiscalLogger.info(
    { receiptId, refundId: refund.id, paymentId: refund.paymentId, amount: refund.amount },
    'Return receipt created'
  );

  await enqueueReceiptSafely(receiptId);

  return receiptId;
};

/* -------------------------------------------------------------------------- */
/*                                   Выпуск                                    */
/* -------------------------------------------------------------------------- */

const receiptInclude = {
  payment: { select: { id: true, amount: true, purpose: true, metadata: true } },
  user: { select: { phone: true, email: true, patient: { select: { iin: true } } } },
} as const;

type ReceiptWithContext = Prisma.FiscalReceiptGetPayload<{ include: typeof receiptInclude }>;

/** `+7XXXXXXXXXX` или ничего: Webkassa ждёт телефон в этом виде. */
const toCustomerPhone = (phone: string | null | undefined): string | undefined => {
  const digits = (phone ?? '').replace(/\D/g, '');

  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 10) return `+7${digits}`;

  return undefined;
};

/** 12 цифр или ничего: Webkassa отклоняет чек с ИИН другой длины. */
const toCustomerXin = (iin: string | null | undefined): string | undefined => {
  const digits = (iin ?? '').replace(/\D/g, '');
  return digits.length === 12 ? digits : undefined;
};

/** `dd.MM.yyyy HH:mm:ss[ ±HH:MM]` → Date; без смещения — время кассы. */
export const parseWebkassaDateTime = (value: string | undefined | null): Date | null => {
  if (!value) return null;

  const match =
    /^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2}):(\d{2})(?:\s*([+-]\d{2}:?\d{2}))?/.exec(
      value.trim()
    );
  if (!match) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  const [, day, month, year, hours, minutes, seconds, rawOffset] = match;
  const offset = rawOffset
    ? rawOffset.length === 5
      ? `${rawOffset.slice(0, 3)}:${rawOffset.slice(3)}`
      : rawOffset
    : CASHBOX_UTC_OFFSET;

  const parsed = new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offset}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** Время кассы для `ReturnBasisDetails.DateTime`: `YYYY-MM-DD HH:mm:ss`. */
export const formatCashboxDateTime = (date: Date): string =>
  new Date(date.getTime() + CASHBOX_UTC_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ');

const errorText = (error: unknown): string =>
  String((error as Error)?.message || error).slice(0, ERROR_TEXT_MAX);

const markIssued = async (
  receipt: FiscalReceipt,
  data: WebkassaCheckData,
  viaDuplicate: boolean
) => {
  const fiscalizedAt =
    parseWebkassaDateTime(data.DateTimeUTC) ?? parseWebkassaDateTime(data.DateTime) ?? new Date();

  await prismaClient.fiscalReceipt.update({
    where: { id: receipt.id },
    data: {
      status: FiscalReceiptStatus.ISSUED,
      checkNumber: data.CheckNumber ? String(data.CheckNumber) : null,
      registrationNumber: data.Cashbox?.RegistrationNumber ?? null,
      checkOrderNumber: typeof data.CheckOrderNumber === 'number' ? data.CheckOrderNumber : null,
      shiftNumber: typeof data.ShiftNumber === 'number' ? data.ShiftNumber : null,
      offlineMode: data.OfflineMode ?? null,
      fiscalizedAt,
      ticketUrl: data.TicketUrl ?? null,
      ticketPrintUrl: data.TicketPrintUrl ?? null,
      lastError: null,
      lastErrorCode: null,
    },
  });

  fiscalLogger.info(
    {
      receiptId: receipt.id,
      paymentId: receipt.paymentId,
      externalCheckNumber: receipt.externalCheckNumber,
      operationType: receipt.operationType,
      checkNumber: data.CheckNumber,
      shiftNumber: data.ShiftNumber,
      offlineMode: data.OfflineMode ?? false,
      viaDuplicate,
    },
    'Fiscal receipt issued'
  );

  void auditLogService.log({
    event: AuditEvent.FISCAL_RECEIPT_ISSUED,
    success: true,
    userId: receipt.userId,
    metadata: {
      receiptId: receipt.id,
      paymentId: receipt.paymentId,
      operationType: receipt.operationType,
      amount: receipt.amount,
      checkNumber: data.CheckNumber ? String(data.CheckNumber) : null,
      shiftNumber: typeof data.ShiftNumber === 'number' ? data.ShiftNumber : null,
      offlineMode: data.OfflineMode ?? false,
      viaDuplicate,
    },
  });

  return FiscalReceiptStatus.ISSUED;
};

const markFailed = async (
  receipt: Pick<
    FiscalReceipt,
    'id' | 'paymentId' | 'userId' | 'operationType' | 'amount' | 'externalCheckNumber'
  >,
  reason: string,
  code: number | null
): Promise<FiscalReceiptStatus> => {
  await prismaClient.fiscalReceipt.update({
    where: { id: receipt.id },
    data: {
      status: FiscalReceiptStatus.FAILED,
      lastError: reason.slice(0, ERROR_TEXT_MAX),
      lastErrorCode: code,
    },
  });

  fiscalLogger.error(
    {
      receiptId: receipt.id,
      paymentId: receipt.paymentId,
      externalCheckNumber: receipt.externalCheckNumber,
      operationType: receipt.operationType,
      code,
      error: reason,
    },
    'Fiscal receipt FAILED, an operator has to retry it'
  );

  Sentry.captureMessage('Fiscal receipt failed', {
    level: 'error',
    extra: { receiptId: receipt.id, paymentId: receipt.paymentId, code, error: reason },
  });

  void auditLogService.log({
    event: AuditEvent.FISCAL_RECEIPT_FAILED,
    success: false,
    userId: receipt.userId,
    metadata: {
      receiptId: receipt.id,
      paymentId: receipt.paymentId,
      operationType: receipt.operationType,
      amount: receipt.amount,
      code,
      error: reason.slice(0, ERROR_TEXT_MAX),
    },
  });

  return FiscalReceiptStatus.FAILED;
};

/**
 * Повторяемый исход: записать причину и либо отдать задачу BullMQ на повтор, либо — если
 * это была последняя попытка — перевести чек в FAILED.
 */
const retryOrFail = async (
  receipt: FiscalReceipt,
  reason: string,
  code: number | null,
  isLastAttempt: boolean
): Promise<FiscalReceiptStatus> => {
  if (isLastAttempt) return markFailed(receipt, reason, code);

  await prismaClient.fiscalReceipt.update({
    where: { id: receipt.id },
    data: { lastError: reason.slice(0, ERROR_TEXT_MAX), lastErrorCode: code },
  });

  fiscalLogger.warn(
    {
      receiptId: receipt.id,
      paymentId: receipt.paymentId,
      externalCheckNumber: receipt.externalCheckNumber,
      code,
      error: reason,
    },
    'Fiscal receipt not issued yet, will retry'
  );

  throw new FiscalRetryableError(reason);
};

interface BuiltCheck {
  body: Omit<WebkassaCheckRequest, 'Token'>;
  snapshot: ReceiptContentSnapshot & { returnBasis?: WebkassaCheckRequest['ReturnBasisDetails'] };
}

const customerFields = (receipt: ReceiptWithContext) => {
  const phone = config.webkassa.sendCustomerPhone ? toCustomerPhone(receipt.user.phone) : undefined;
  const email = receipt.user.email?.trim() || undefined;
  const xin = toCustomerXin(receipt.user.patient?.iin);

  return {
    ...(phone ? { CustomerPhone: phone } : {}),
    ...(email ? { CustomerEmail: email } : {}),
    ...(xin ? { CustomerXin: xin } : {}),
  };
};

const buildCheck = (
  receipt: ReceiptWithContext,
  descriptors: PositionDescriptor[],
  operationType: number,
  returnBasis?: WebkassaCheckRequest['ReturnBasisDetails']
): BuiltCheck => {
  const content = buildReceiptContent(descriptors);

  return {
    body: {
      CashboxUniqueNumber: config.webkassa.cashboxUniqueNumber,
      OperationType: operationType,
      Positions: content.positions,
      Payments: content.payments,
      Change: 0,
      RoundType: WEBKASSA_ROUND_TYPE_NONE,
      ExternalCheckNumber: receipt.externalCheckNumber,
      ExternalOrderNumber: receipt.paymentId,
      ...customerFields(receipt),
      ...(returnBasis ? { ReturnBasisDetails: returnBasis } : {}),
    },
    snapshot: { ...content, ...(returnBasis ? { returnBasis } : {}) },
  };
};

type SaleForReturn = Pick<
  FiscalReceipt,
  | 'status'
  | 'checkNumber'
  | 'registrationNumber'
  | 'fiscalizedAt'
  | 'amount'
  | 'offlineMode'
  | 'positions'
>;

/** Состав чека возврата: позиция чека продажи на сумму возврата + реквизиты продажи. */
const buildReturnCheck = (receipt: ReceiptWithContext, sale: SaleForReturn): BuiltCheck | null => {
  if (!sale.checkNumber || !sale.registrationNumber || !sale.fiscalizedAt) return null;

  const position = firstPositionOf(sale.positions) ?? buildSalePositions(receipt.payment)[0];

  return buildCheck(
    receipt,
    [{ name: position.name, code: position.code, price: receipt.amount }],
    WEBKASSA_OPERATION.saleReturn,
    {
      CheckNumber: sale.checkNumber,
      RegistrationNumber: sale.registrationNumber,
      DateTime: formatCashboxDateTime(sale.fiscalizedAt),
      Total: toMoney(sale.amount),
      IsOffline: sale.offlineMode ?? false,
    }
  );
};

/** Z-отчёт посреди выпуска чека (ошибка 11): ошибки только логируются. */
const closeShiftForRetry = async (receiptId: string): Promise<void> => {
  try {
    const result = await closeShift();
    fiscalLogger.info(
      { receiptId, ...result },
      'Shift closed after error 11, retrying the receipt'
    );
  } catch (error) {
    fiscalLogger.error({ err: error, receiptId }, 'Failed to close the shift after error 11');
  }
};

/**
 * Регистрирует чек в Webkassa и записывает исход в строку.
 *
 * Наружу бросает только `FiscalRetryableError` — намеренно, чтобы BullMQ повторил задачу с
 * паузой. Всё остальное (успех, отказ, выключенный флаг) остаётся в самой строке.
 *
 * `isLastAttempt` — последняя попытка задачи: повторяемая ошибка на ней уже не бросается,
 * а переводит чек в FAILED.
 */
export const issueReceipt = async (
  receiptId: string,
  { isLastAttempt = false }: { isLastAttempt?: boolean } = {}
): Promise<FiscalReceiptStatus | null> => {
  const receipt = await prismaClient.fiscalReceipt.findUnique({
    where: { id: receiptId },
    include: receiptInclude,
  });

  if (!receipt) {
    fiscalLogger.warn({ receiptId }, 'Fiscal receipt disappeared before it could be issued');
    return null;
  }

  // Уже выпущен или ждёт оператора.
  if (receipt.status !== FiscalReceiptStatus.PENDING) return receipt.status;

  const blocker = getWebkassaBlocker();
  if (blocker) {
    logWebkassaBlocker(blocker, { receiptId, paymentId: receipt.paymentId });
    return FiscalReceiptStatus.PENDING;
  }

  let built: BuiltCheck;

  if (receipt.operationType === FiscalOperationType.SALE_RETURN) {
    const sale = await prismaClient.fiscalReceipt.findFirst({
      where: { paymentId: receipt.paymentId, operationType: FiscalOperationType.SALE },
      select: {
        status: true,
        checkNumber: true,
        registrationNumber: true,
        fiscalizedAt: true,
        amount: true,
        offlineMode: true,
        positions: true,
      },
    });

    if (sale?.status === FiscalReceiptStatus.PENDING) {
      return retryOrFail(receipt, FISCAL_MESSAGES.salePending, null, isLastAttempt);
    }

    if (sale?.status !== FiscalReceiptStatus.ISSUED) {
      return retryOrFail(receipt, FISCAL_MESSAGES.saleMissing, null, isLastAttempt);
    }

    const returnCheck = buildReturnCheck(receipt, sale);
    if (!returnCheck) return markFailed(receipt, FISCAL_MESSAGES.saleIncomplete, null);

    built = returnCheck;
  } else {
    built = buildCheck(receipt, buildSalePositions(receipt.payment), WEBKASSA_OPERATION.sale);
  }

  const total = built.body.Payments[0]?.Sum ?? 0;
  if (Math.abs(total - receipt.amount) > AMOUNT_EPSILON) {
    // Сборка позиций гарантирует совпадение; сюда можно попасть только при порче данных.
    return markFailed(
      receipt,
      `Сумма позиций ${total} не совпадает с суммой чека ${receipt.amount}`,
      null
    );
  }

  await prismaClient.fiscalReceipt.update({
    where: { id: receipt.id },
    data: {
      attempts: { increment: 1 },
      cashboxUniqueNumber: built.body.CashboxUniqueNumber,
      positions: built.snapshot as unknown as Prisma.InputJsonValue,
    },
  });

  const send = () => webkassaClient.createCheck(built.body);

  try {
    let data: WebkassaCheckData;
    try {
      data = await send();
    } catch (error) {
      if (!isWebkassaError(error) || error.code !== WEBKASSA_ERROR.shiftOver24h) throw error;
      // Смена дольше 24 часов: закрыть её Z-отчётом и повторить чек один раз.
      await closeShiftForRetry(receipt.id);
      data = await send();
    }

    return await markIssued(receipt, data, false);
  } catch (error) {
    if (!isWebkassaError(error)) {
      // Не ответ Webkassa (Redis, БД) — повторяемо, ExternalCheckNumber защищает от дубля.
      return retryOrFail(receipt, errorText(error), null, isLastAttempt);
    }

    return handleWebkassaError(receipt, error, isLastAttempt);
  }
};

const handleWebkassaError = async (
  receipt: FiscalReceipt,
  error: WebkassaError,
  isLastAttempt: boolean
): Promise<FiscalReceiptStatus> => {
  if (error.code === WEBKASSA_ERROR.duplicateExternalCheckNumber) {
    // Чек с этим ExternalCheckNumber уже пробит (потерянный ответ, повтор задачи):
    // Webkassa отдаёт его реквизиты вместе с ошибкой — это и есть наш чек.
    const data = error.data as WebkassaCheckData | undefined;
    if (data?.CheckNumber) return markIssued(receipt, data, true);

    return markFailed(receipt, FISCAL_MESSAGES.duplicateWithoutData, error.code);
  }

  if (!error.retryable) return markFailed(receipt, error.message, error.code);

  return retryOrFail(receipt, error.message, error.code, isLastAttempt);
};

/**
 * Последняя попытка задачи упала чем-то неожиданным (вне `issueReceipt`): если чек всё ещё
 * PENDING, он переводится в FAILED, чтобы попасть оператору.
 */
export const failReceiptAfterRetries = async (receiptId: string, reason: string): Promise<void> => {
  const receipt = await prismaClient.fiscalReceipt.findUnique({ where: { id: receiptId } });

  if (!receipt || receipt.status !== FiscalReceiptStatus.PENDING) return;

  await markFailed(receipt, reason || 'Исчерпаны попытки', receipt.lastErrorCode);
};

/* -------------------------------------------------------------------------- */
/*                               Смена и сверка                                */
/* -------------------------------------------------------------------------- */

export interface ShiftCloseResult {
  closed: boolean;
  shiftNumber: number | null;
}

/**
 * Z-отчёт. Нет открытой смены (12/13) — не ошибка: закрывать нечего. Любая другая ошибка
 * пробрасывается (ручной вызов отвечает 502, у плановой задачи — `error` в логе; следующий
 * чек при ошибке 11 закроет смену сам).
 */
export const closeShift = async (): Promise<ShiftCloseResult> => {
  try {
    const data = await webkassaClient.closeShift();
    const shiftNumber = typeof data?.ShiftNumber === 'number' ? data.ShiftNumber : null;

    fiscalLogger.info({ shiftNumber }, 'Webkassa shift closed (Z-report)');

    void auditLogService.log({
      event: AuditEvent.FISCAL_SHIFT_CLOSED,
      success: true,
      metadata: { shiftNumber, cashboxUniqueNumber: config.webkassa.cashboxUniqueNumber },
    });

    return { closed: true, shiftNumber };
  } catch (error) {
    if (
      isWebkassaError(error) &&
      (error.code === WEBKASSA_ERROR.shiftAlreadyClosed ||
        error.code === WEBKASSA_ERROR.noOpenShift)
    ) {
      fiscalLogger.info({ code: error.code }, 'No open Webkassa shift, nothing to close');
      return { closed: false, shiftNumber: null };
    }

    fiscalLogger.error({ err: error }, 'Webkassa Z-report failed');
    throw error;
  }
};

/** Плановый Z-отчёт: при выключенной кассе — ничего не делает. */
export const runScheduledShiftClose = async (): Promise<ShiftCloseResult> => {
  const blocker = getWebkassaBlocker();
  if (blocker) {
    logWebkassaBlocker(blocker, { job: 'close-shift' });
    return { closed: false, shiftNumber: null };
  }

  return closeShift();
};

/**
 * Переотправка потерянных: PENDING-чеки старше двух минут снова ставятся в очередь.
 * Дедупликация — по `jobId`, поэтому чек, который ждёт повтора, второй задачи не получит.
 * Так покрываются и потерянная постановка, и включение флага после простоя.
 */
export const sweepPendingReceipts = async (): Promise<{ queued: number }> => {
  const blocker = getWebkassaBlocker();
  if (blocker) {
    if (blocker.kind === 'misconfigured') logWebkassaBlocker(blocker, { job: 'sweep' });
    return { queued: 0 };
  }

  const pending = await prismaClient.fiscalReceipt.findMany({
    where: {
      status: FiscalReceiptStatus.PENDING,
      createdAt: { lt: new Date(Date.now() - SWEEP_MIN_AGE_MS) },
    },
    select: { id: true, retryRound: true },
    orderBy: { createdAt: 'asc' },
    take: SWEEP_BATCH,
  });

  for (const receipt of pending) {
    await enqueueReceiptSafely(receipt.id, receipt.retryRound);
  }

  return { queued: pending.length };
};
