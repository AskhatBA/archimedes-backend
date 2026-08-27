import { Checkup, PaymentPurpose, ProgramOrderCategory } from '@prisma/client';

import { prismaClient } from '@/infrastructure/db';
import {
  registerPaymentPurposeHandler,
  PaymentSuccessContext,
} from '@/domains/payment/payment.post-success.service';
import { createLogger } from '@/shared/lib/logger';
import { ErrorCodes } from '@/shared/constants/error-codes';
import { AppError } from '@/shared/services/app-error.service';
import * as auditLogService from '@/shared/services/audit-log.service';
import { AuditEvent } from '@/shared/services/audit-log.service';

import * as programOrdersService from './program-orders.service';
import type { ProgramOrderItemInput, ProgramOrderMetadata } from './program-orders.dto';

const handlerLogger = createLogger('program-order-payment');

/** A cart is a handful of programs; anything past this is a malformed or hostile payload. */
const MAX_ITEMS = 20;

/** Prices are floats in the DB, so the total check needs a tolerance below one tiyn. */
const AMOUNT_EPSILON = 0.005;

const isCategory = (value: unknown): value is ProgramOrderCategory =>
  typeof value === 'string' && value in ProgramOrderCategory;

const requireString = (value: unknown, field: string, max = 300): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError(`metadata.${field} is required`, 400);
  }
  return value.trim().slice(0, max);
};

const optionalString = (value: unknown, max = 300): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, max) : undefined;

const requirePrice = (value: unknown, field: string): number => {
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) {
    throw new AppError(`metadata.${field} must be a non-negative number`, 400);
  }
  return price;
};

/**
 * Validates the cart the app is about to send the user to pay for.
 *
 * Runs at `/payment/init`, before the payment record exists, so a malformed cart is
 * refused while nobody has paid yet. What this returns is what gets stored on the payment
 * and handed back to `onSuccess` — a cart that survives here is the order.
 */
const validateMetadata = (metadata: unknown): ProgramOrderMetadata => {
  if (typeof metadata !== 'object' || metadata === null) {
    throw new AppError('metadata is required for a paid-program payment', 400);
  }

  const raw = metadata as Record<string, unknown>;

  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    throw new AppError('metadata.items must contain at least one program', 400);
  }

  if (raw.items.length > MAX_ITEMS) {
    throw new AppError(`metadata.items must contain at most ${MAX_ITEMS} programs`, 400);
  }

  const items: ProgramOrderItemInput[] = raw.items.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new AppError(`metadata.items[${index}] must be an object`, 400);
    }

    const item = entry as Record<string, unknown>;

    if (!isCategory(item.category)) {
      throw new AppError(`metadata.items[${index}].category must be MED_PLAN or CHECKUP`, 400);
    }

    const code = optionalString(item.code, 64);

    return {
      category: item.category,
      // The app models the catalogue card's identifier as `id`; either name is accepted so
      // the cart can be posted as it stands on screen.
      externalId: requireString(item.externalId ?? item.id, `items[${index}].externalId`, 128),
      title: requireString(item.title, `items[${index}].title`),
      price: requirePrice(item.price, `items[${index}].price`),
      ...(code ? { code } : {}),
    };
  });

  const contactPhone = optionalString(raw.contactPhone, 32);
  const comment = optionalString(raw.comment, 1000);

  return {
    items,
    ...(contactPhone ? { contactPhone } : {}),
    ...(comment ? { comment } : {}),
  };
};

/** Check-ups are ours, so their ids and prices are checked against the catalogue itself. */
const loadCheckups = async (items: ProgramOrderItemInput[]): Promise<Map<string, Checkup>> => {
  const ids = items
    .filter((item) => item.category === ProgramOrderCategory.CHECKUP)
    .map((item) => item.externalId);

  if (ids.length === 0) return new Map();

  const checkups = await prismaClient.checkup.findMany({
    // The app sends the uuid, but a deep link may carry the stable slug — both resolve.
    where: { OR: [{ id: { in: ids } }, { code: { in: ids } }] },
  });

  const byKey = new Map<string, Checkup>();
  checkups.forEach((checkup) => {
    byKey.set(checkup.id, checkup);
    byKey.set(checkup.code, checkup);
  });

  return byKey;
};

/**
 * Refuses a checkout that could not be turned into an honest order.
 *
 * Two things are worth stopping here rather than after the money moves: a check-up that
 * has been retired or repriced since the catalogue was cached on the device, and a total
 * that does not add up to the cart — the amount is what actually gets charged, so it has
 * to be the sum of what the order says was bought.
 *
 * Med-plan prices belong to the MIS and are taken as the app received them; only the sum
 * is enforced for those.
 */
const ensureOrderable = async ({
  amount,
  metadata,
}: {
  userId: string;
  amount: number;
  metadata: ProgramOrderMetadata;
}): Promise<void> => {
  const checkups = await loadCheckups(metadata.items);

  metadata.items.forEach((item) => {
    if (item.category !== ProgramOrderCategory.CHECKUP) return;

    const checkup = checkups.get(item.externalId);

    if (!checkup || !checkup.isActive) {
      throw new AppError(ErrorCodes.CHECKUP_NOT_FOUND, 404);
    }

    if (Math.abs(checkup.price - item.price) > AMOUNT_EPSILON) {
      throw new AppError(ErrorCodes.PROGRAM_ORDER_PRICE_CHANGED, 409);
    }
  });

  const itemsTotal = metadata.items.reduce((sum, item) => sum + item.price, 0);

  if (Math.abs(itemsTotal - amount) > AMOUNT_EPSILON) {
    throw new AppError(ErrorCodes.PROGRAM_ORDER_TOTAL_MISMATCH, 400);
  }
};

/**
 * Records the order the patient has just paid for.
 *
 * Runs when the payment settles as SUCCESS — from the FreedomPay result callback or from
 * the background reconciliation sweep, whichever gets there first — so the order lands in
 * the database even if the app was closed on the provider's page.
 *
 * Check-up rows are re-read from the catalogue so the stored title and code are ours
 * rather than whatever the client sent; med plans keep the MIS snapshot the app showed.
 */
const createOrder = async (context: PaymentSuccessContext): Promise<void> => {
  const metadata = validateMetadata(context.metadata);
  const checkups = await loadCheckups(metadata.items);

  const items = metadata.items.map((item) => {
    const checkup =
      item.category === ProgramOrderCategory.CHECKUP ? checkups.get(item.externalId) : undefined;

    if (!checkup) return item;

    return { ...item, externalId: checkup.id, code: checkup.code, title: checkup.title };
  });

  const user = await prismaClient.user.findUnique({
    where: { id: context.userId },
    select: { phone: true },
  });

  const order = await programOrdersService.createOrderForPayment({
    userId: context.userId,
    paymentId: context.paymentId,
    total: context.amount,
    items,
    contactPhone: metadata.contactPhone ?? user?.phone ?? null,
    ...(metadata.comment ? { comment: metadata.comment } : {}),
  });

  handlerLogger.info(
    {
      orderId: order.id,
      paymentId: context.paymentId,
      userId: context.userId,
      total: order.total,
      itemsCount: order.items.length,
    },
    'Paid-program order created after successful payment'
  );

  auditLogService.log({
    event: AuditEvent.PROGRAM_ORDER_CREATED,
    success: true,
    userId: context.userId,
    metadata: {
      orderId: order.id,
      paymentId: context.paymentId,
      total: order.total,
      items: order.items.map((item) => ({
        category: item.category,
        externalId: item.externalId,
        price: item.price,
      })),
    },
  });
};

export const registerProgramOrderPaymentHandler = (): void => {
  registerPaymentPurposeHandler<ProgramOrderMetadata>(PaymentPurpose.PAID_PROGRAM, {
    validateMetadata,
    beforePayment: ensureOrderable,
    onSuccess: createOrder,
  });
};
