import {
  Prisma,
  ProgramOrder,
  ProgramOrderCategory,
  ProgramOrderItem,
  ProgramOrderStatus,
} from '@prisma/client';

import { prismaClient } from '@/infrastructure/db';
import { ErrorCodes } from '@/shared/constants/error-codes';
import { AppError } from '@/shared/services/app-error.service';

import type {
  AdminProgramOrderListParams,
  ProgramOrderAdminDto,
  ProgramOrderDto,
  ProgramOrderEmailData,
  ProgramOrderItemInput,
  UpdateProgramOrderBody,
} from './program-orders.dto';

type OrderWithItems = ProgramOrder & { items: ProgramOrderItem[] };

const toItemDto = (item: ProgramOrderItem) => ({
  id: item.id,
  category: item.category,
  externalId: item.externalId,
  code: item.code,
  title: item.title,
  price: item.price,
});

const toDto = (order: OrderWithItems): ProgramOrderDto => ({
  id: order.id,
  status: order.status,
  total: order.total,
  contactPhone: order.contactPhone,
  comment: order.comment,
  paymentId: order.paymentId,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  items: order.items.map(toItemDto),
});

/**
 * Writes the order a settled payment paid for.
 *
 * Called only from the `PAID_PROGRAM` post-success handler. `paymentId` is unique, so a
 * replayed provider callback or a reconciliation sweep landing on the same payment finds
 * the order already there and returns it instead of creating a second one — the handler
 * runs once per payment, but this stays idempotent on its own so a partial failure can be
 * retried safely.
 */
export const createOrderForPayment = async ({
  userId,
  paymentId,
  total,
  items,
  contactPhone,
  comment,
}: {
  userId: string;
  paymentId: string;
  total: number;
  items: ProgramOrderItemInput[];
  contactPhone?: string | null;
  comment?: string | null;
}): Promise<ProgramOrderDto> => {
  const existing = await prismaClient.programOrder.findUnique({
    where: { paymentId },
    include: { items: true },
  });

  if (existing) return toDto(existing);

  const order = await prismaClient.programOrder.create({
    data: {
      userId,
      paymentId,
      total,
      contactPhone: contactPhone ?? null,
      comment: comment ?? null,
      items: {
        create: items.map((item) => ({
          category: item.category,
          externalId: item.externalId,
          code: item.code ?? null,
          title: item.title,
          price: item.price,
        })),
      },
    },
    include: { items: true },
  });

  return toDto(order);
};

/**
 * Reads one order with the patient behind it, for the notification email.
 *
 * Returns `null` rather than throwing: the caller is a queue worker, and an order
 * deleted between the payment settling and the job running is nothing to retry.
 */
export const getOrderForEmail = async (
  orderId: string
): Promise<ProgramOrderEmailData | null> => {
  const order = await prismaClient.programOrder.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      user: {
        select: {
          phone: true,
          patient: { select: { fullName: true, iin: true } },
        },
      },
    },
  });

  if (!order) return null;

  const { user, ...rest } = order;

  return {
    ...toDto(rest),
    userId: order.userId,
    patientName: user.patient?.fullName ?? null,
    patientIin: user.patient?.iin ?? null,
    patientPhone: user.phone,
  };
};

/** The patient's own order history, newest first. */
export const getUserOrders = async (userId: string): Promise<ProgramOrderDto[]> => {
  const orders = await prismaClient.programOrder.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  });

  return orders.map(toDto);
};

/** Scoped to the caller — an order id from someone else's account reads as not found. */
export const getUserOrderById = async (
  userId: string,
  orderId: string
): Promise<ProgramOrderDto> => {
  const order = await prismaClient.programOrder.findFirst({
    where: { id: orderId, userId },
    include: { items: true },
  });

  if (!order) {
    throw new AppError(ErrorCodes.PROGRAM_ORDER_NOT_FOUND, 404);
  }

  return toDto(order);
};

const endOfDay = (date: string): Date => {
  const parsed = new Date(date);
  parsed.setHours(23, 59, 59, 999);
  return parsed;
};

/**
 * Dashboard listing. Not scoped to a user — the caller is an ADMIN — so it paginates and
 * reads the patient's name from our own tables rather than per-row MIS lookups.
 */
export const getAdminOrders = async ({
  page,
  limit,
  search,
  status,
  category,
  dateFrom,
  dateTo,
}: AdminProgramOrderListParams) => {
  const where: Prisma.ProgramOrderWhereInput = {};

  if (status) where.status = status;
  if (category) where.items = { some: { category } };

  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      // `dateTo` is a day, and the caller means the whole of it — without this an order
      // placed at 14:00 would fall outside a range ending on its own date.
      ...(dateTo ? { lte: endOfDay(dateTo) } : {}),
    };
  }

  if (search) {
    where.OR = [
      { user: { phone: { contains: search, mode: 'insensitive' } } },
      { user: { patient: { fullName: { contains: search, mode: 'insensitive' } } } },
      { user: { patient: { iin: { contains: search } } } },
      { items: { some: { title: { contains: search, mode: 'insensitive' } } } },
    ];
  }

  const [total, rows, totals] = await Promise.all([
    prismaClient.programOrder.count({ where }),
    prismaClient.programOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        items: true,
        user: {
          select: {
            phone: true,
            patient: { select: { fullName: true, iin: true } },
          },
        },
      },
    }),
    // Summed over the whole filtered set rather than the page — the dashboard shows it as
    // the header figure for the active filters.
    prismaClient.programOrder.aggregate({ where, _sum: { total: true } }),
  ]);

  const items: ProgramOrderAdminDto[] = rows.map(({ user, ...order }) => ({
    ...toDto(order),
    userId: order.userId,
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
    totalAmount: totals._sum.total ?? 0,
  };
};

export const getAdminOrderById = async (orderId: string): Promise<ProgramOrderDto> => {
  const order = await prismaClient.programOrder.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) {
    throw new AppError(ErrorCodes.PROGRAM_ORDER_NOT_FOUND, 404);
  }

  return toDto(order);
};

/**
 * Moves an order along, or attaches an operator's note. Only the keys present in the body
 * are written — the money side of an order is never editable, it belongs to the payment.
 */
export const updateOrder = async (
  orderId: string,
  body: UpdateProgramOrderBody
): Promise<{ order: ProgramOrderDto; previousStatus: ProgramOrderStatus }> => {
  const existing = await prismaClient.programOrder.findUnique({ where: { id: orderId } });

  if (!existing) {
    throw new AppError(ErrorCodes.PROGRAM_ORDER_NOT_FOUND, 404);
  }

  const data: Prisma.ProgramOrderUpdateInput = {};

  if (body.status !== undefined) data.status = body.status;
  if (body.comment !== undefined) data.comment = body.comment;

  const order = await prismaClient.programOrder.update({
    where: { id: orderId },
    data,
    include: { items: true },
  });

  return { order: toDto(order), previousStatus: existing.status };
};

export { ProgramOrderCategory, ProgramOrderStatus };
