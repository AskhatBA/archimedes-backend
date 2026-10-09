import { PaymentPurpose, Prisma } from '@prisma/client';

import { config } from '@/config';
import { createLogger } from '@/shared/lib/logger';

import {
  WEBKASSA_POSITION_TYPE_SERVICE,
  WEBKASSA_UNIT_CODE_SERVICE,
  WebkassaPayment,
  WebkassaPosition,
} from './webkassa.types';

/**
 * Состав чека: позиции по назначению платежа.
 *
 * Позиции берутся из `payment.metadata`, которую назначение уже проверило на
 * `/payment/init`. Сумма цен обязана сойтись с `payment.amount` — это то, что списал
 * FreedomPay, и чек не может расходиться с ним.
 */

const positionsLogger = createLogger('fiscal-positions');

/** Безопасная длина названия позиции: длиннее Webkassa может не принять. */
const POSITION_NAME_MAX = 128;
const POSITION_CODE_MAX = 64;

/** Суммы во `Float`, поэтому сравнение — с допуском меньше тиына. */
export const AMOUNT_EPSILON = 0.005;

export const POSITION_NAMES = {
  appointment: 'Приём врача',
  telemedicine: 'Онлайн-консультация врача',
  paidProgramsSummary: 'Оплата платных программ',
  medAccountTopup: 'Пополнение медицинского счёта',
  payment: 'Оплата медицинских услуг',
} as const;

/** До тиына. */
export const toMoney = (value: number): number => Math.round(value * 100) / 100;

/** НДС в цене по формуле Webkassa: `Price * p / (100 + p)`, до сотых; без НДС — 0. */
export const taxOf = (price: number, taxType: number, taxPercent: number): number =>
  taxType === 0 || taxPercent <= 0 ? 0 : toMoney((price * taxPercent) / (100 + taxPercent));

/** Название и код позиции — всё, что от неё переходит в чек возврата. */
export interface PositionDescriptor {
  name: string;
  code?: string | undefined;
  price: number;
}

const trimText = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
};

/** Одна позиция-услуга с налогом из конфига. */
export const toWebkassaPosition = ({ name, code, price }: PositionDescriptor): WebkassaPosition => {
  const { taxType, taxPercent } = config.webkassa;
  const rounded = toMoney(price);

  return {
    Count: 1,
    Price: rounded,
    TaxType: taxType,
    TaxPercent: taxType === 0 ? 0 : taxPercent,
    Tax: taxOf(rounded, taxType, taxPercent),
    PositionName: name.slice(0, POSITION_NAME_MAX),
    ...(code ? { PositionCode: code.slice(0, POSITION_CODE_MAX) } : {}),
    PositionType: WEBKASSA_POSITION_TYPE_SERVICE,
    UnitCode: WEBKASSA_UNIT_CODE_SERVICE,
  };
};

const asRecord = (value: Prisma.JsonValue | null): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const appointmentPositions = (amount: number, metadata: Record<string, unknown>) => {
  const name =
    trimText(metadata.serviceName, POSITION_NAME_MAX) ??
    (metadata.isTelemedicine === true ? POSITION_NAMES.telemedicine : POSITION_NAMES.appointment);

  return [{ name, code: trimText(metadata.medicServiceOid, POSITION_CODE_MAX), price: amount }];
};

const paidProgramPositions = (
  paymentId: string,
  amount: number,
  metadata: Record<string, unknown>
): PositionDescriptor[] => {
  const items = Array.isArray(metadata.items) ? metadata.items : [];

  const positions: PositionDescriptor[] = items
    .map((entry) => asRecord(entry as Prisma.JsonValue))
    .map((item) => ({
      name: trimText(item.title, POSITION_NAME_MAX) ?? POSITION_NAMES.paidProgramsSummary,
      code: trimText(item.code, POSITION_CODE_MAX),
      price: toMoney(Number(item.price)),
    }))
    // Бесплатная позиция ничего не добавляет к сумме, а Webkassa может её не принять.
    .filter((item) => Number.isFinite(item.price) && item.price > 0);

  const sum = positions.reduce((total, item) => total + item.price, 0);

  if (positions.length === 0 || Math.abs(sum - amount) > AMOUNT_EPSILON) {
    // init уже сверял корзину с суммой, так что сюда попадает только сбой данных. Чек всё
    // равно нужен на списанные деньги — одной сводной позицией на всю сумму.
    positionsLogger.warn(
      { paymentId, amount, itemsSum: toMoney(sum), items: positions.length },
      'Paid-program items do not add up to the payment, using a single summary position'
    );
    return [{ name: POSITION_NAMES.paidProgramsSummary, price: amount }];
  }

  return positions;
};

/** Позиции чека продажи по назначению платежа. */
export const buildSalePositions = (payment: {
  id: string;
  amount: number;
  purpose: PaymentPurpose;
  metadata: Prisma.JsonValue | null;
}): PositionDescriptor[] => {
  const amount = toMoney(payment.amount);
  const metadata = asRecord(payment.metadata);

  switch (payment.purpose) {
    case PaymentPurpose.APPOINTMENT:
      return appointmentPositions(amount, metadata);
    case PaymentPurpose.PAID_PROGRAM:
      return paidProgramPositions(payment.id, amount, metadata);
    case PaymentPurpose.MED_ACCOUNT_TOPUP:
      return [{ name: POSITION_NAMES.medAccountTopup, price: amount }];
    default:
      return [{ name: POSITION_NAMES.payment, price: amount }];
  }
};

/** Снимок того, что ушло в Webkassa, — без контактов покупателя. */
export interface ReceiptContentSnapshot {
  positions: WebkassaPosition[];
  payments: WebkassaPayment[];
}

/** Позиции + оплата одной суммой: `Payments[0].Sum` — ровно сумма цен позиций. */
export const buildReceiptContent = (descriptors: PositionDescriptor[]): ReceiptContentSnapshot => {
  const positions = descriptors.map(toWebkassaPosition);
  const total = toMoney(
    positions.reduce((sum, position) => sum + position.Price * position.Count, 0)
  );

  return {
    positions,
    payments: [{ Sum: total, PaymentType: config.webkassa.paymentType }],
  };
};

/** Название и код первой позиции из снимка чека продажи — для чека возврата. */
export const firstPositionOf = (
  snapshot: Prisma.JsonValue | null
): { name: string; code?: string | undefined } | null => {
  const positions = asRecord(snapshot).positions;
  if (!Array.isArray(positions) || positions.length === 0) return null;

  const first = asRecord(positions[0] as Prisma.JsonValue);
  const name = trimText(first.PositionName, POSITION_NAME_MAX);
  if (!name) return null;

  return { name, code: trimText(first.PositionCode, POSITION_CODE_MAX) };
};
