import {
  MedAccountTopup,
  MedAccountTopupOption,
  MedAccountTopupStatus,
  Prisma,
} from '@prisma/client';

import { prismaClient } from '@/infrastructure/db';
import { ErrorCodes } from '@/shared/constants/error-codes';
import { AppError } from '@/shared/services/app-error.service';

import type {
  AdminTopupListParams,
  CreateMedAccountOptionBody,
  MedAccountOptionAdminItem,
  MedAccountOptionItem,
  MedAccountTopupAdminDto,
  MedAccountTopupDto,
  UpdateMedAccountOptionBody,
  UpdateMedAccountTopupBody,
} from './med-account.dto';

/* -------------------------------------------------------------------------- */
/*                            Top-up amount catalogue                          */
/* -------------------------------------------------------------------------- */

/** Strips the columns the app never reads. */
const toItem = (option: MedAccountTopupOption): MedAccountOptionItem => ({
  id: option.id,
  amount: option.amount,
  label: option.label,
  popular: option.popular,
});

const toAdminItem = (option: MedAccountTopupOption): MedAccountOptionAdminItem => ({
  ...toItem(option),
  isActive: option.isActive,
  sortOrder: option.sortOrder,
  createdAt: option.createdAt,
  updatedAt: option.updatedAt,
});

export const getOptions = async (): Promise<MedAccountOptionItem[]> => {
  const options = await prismaClient.medAccountTopupOption.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { amount: 'asc' }],
  });

  return options.map(toItem);
};

/** Unlike the app-facing list, this one includes unpublished amounts. */
export const getAdminOptions = async (): Promise<MedAccountOptionAdminItem[]> => {
  const options = await prismaClient.medAccountTopupOption.findMany({
    orderBy: [{ sortOrder: 'asc' }, { amount: 'asc' }],
  });

  return options.map(toAdminItem);
};

const findOptionOr404 = async (id: string): Promise<MedAccountTopupOption> => {
  const option = await prismaClient.medAccountTopupOption.findUnique({ where: { id } });

  if (!option) {
    throw new AppError(ErrorCodes.MED_ACCOUNT_OPTION_NOT_FOUND, 404);
  }

  return option;
};

/**
 * The screen is a list of distinct amounts, so two rows offering the same sum are an
 * editing mistake — the admin has to resolve it rather than have one silently shadow the
 * other.
 */
const assertAmountIsFree = async (amount: number, exceptId?: string) => {
  const existing = await prismaClient.medAccountTopupOption.findUnique({ where: { amount } });

  if (existing && existing.id !== exceptId) {
    throw new AppError(ErrorCodes.MED_ACCOUNT_OPTION_AMOUNT_TAKEN, 409);
  }
};

/** New amounts land at the end of the list unless the admin picked a position. */
const nextSortOrder = async (): Promise<number> => {
  const last = await prismaClient.medAccountTopupOption.findFirst({
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  return (last?.sortOrder ?? 0) + 10;
};

export const createOption = async (
  body: CreateMedAccountOptionBody
): Promise<MedAccountOptionAdminItem> => {
  await assertAmountIsFree(body.amount);

  const option = await prismaClient.medAccountTopupOption.create({
    data: {
      amount: body.amount,
      label: body.label ?? null,
      ...(body.popular !== undefined && { popular: body.popular }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      sortOrder: body.sortOrder ?? (await nextSortOrder()),
    },
  });

  return toAdminItem(option);
};

export const updateOption = async (
  id: string,
  body: UpdateMedAccountOptionBody
): Promise<MedAccountOptionAdminItem> => {
  await findOptionOr404(id);

  if (body.amount !== undefined) {
    await assertAmountIsFree(body.amount, id);
  }

  // Only the keys the dashboard actually sent are written, so a partial edit never blanks
  // a field the admin left alone.
  const data: Prisma.MedAccountTopupOptionUpdateInput = {
    ...(body.amount !== undefined && { amount: body.amount }),
    ...(body.label !== undefined && { label: body.label ?? null }),
    ...(body.popular !== undefined && { popular: body.popular }),
    ...(body.isActive !== undefined && { isActive: body.isActive }),
    ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
  };

  const option = await prismaClient.medAccountTopupOption.update({ where: { id }, data });

  return toAdminItem(option);
};

/**
 * Removing an amount takes it off the screen but leaves the top-ups bought at it alone —
 * the relation is `SetNull`, so a paid row keeps its own `amount` snapshot and only loses
 * the pointer to a catalogue entry that no longer exists.
 */
export const deleteOption = async (id: string): Promise<MedAccountOptionAdminItem> => {
  const option = await findOptionOr404(id);

  await prismaClient.medAccountTopupOption.delete({ where: { id } });

  return toAdminItem(option);
};

/* -------------------------------------------------------------------------- */
/*                                  Top-ups                                    */
/* -------------------------------------------------------------------------- */

const toTopupDto = (topup: MedAccountTopup): MedAccountTopupDto => ({
  id: topup.id,
  amount: topup.amount,
  status: topup.status,
  paymentId: topup.paymentId,
  optionId: topup.optionId,
  externalRef: topup.externalRef,
  comment: topup.comment,
  creditedAt: topup.creditedAt,
  createdAt: topup.createdAt,
  updatedAt: topup.updatedAt,
});

/**
 * Records the top-up a settled payment paid for.
 *
 * Called only from the `MED_ACCOUNT_TOPUP` post-success handler. `paymentId` is unique, so
 * a replayed provider callback or a reconciliation sweep landing on the same payment finds
 * the row already there and returns it instead of recording a second top-up.
 */
export const createTopupForPayment = async ({
  userId,
  paymentId,
  optionId,
  amount,
  beneficiaryId,
}: {
  userId: string;
  paymentId: string;
  optionId: string | null;
  amount: number;
  beneficiaryId: string | null;
}): Promise<MedAccountTopupDto> => {
  const existing = await prismaClient.medAccountTopup.findUnique({ where: { paymentId } });

  if (existing) return toTopupDto(existing);

  const topup = await prismaClient.medAccountTopup.create({
    data: { userId, paymentId, optionId, amount, beneficiaryId },
  });

  return toTopupDto(topup);
};

/** The patient's own top-up history, newest first. */
export const getUserTopups = async (userId: string): Promise<MedAccountTopupDto[]> => {
  const topups = await prismaClient.medAccountTopup.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  return topups.map(toTopupDto);
};

const endOfDay = (date: string): Date => {
  const parsed = new Date(date);
  parsed.setHours(23, 59, 59, 999);
  return parsed;
};

/**
 * Dashboard listing. Not scoped to a user — the caller is an ADMIN — so it paginates and
 * reads the patient's name from our own tables.
 */
export const getAdminTopups = async ({
  page,
  limit,
  search,
  status,
  dateFrom,
  dateTo,
}: AdminTopupListParams) => {
  const where: Prisma.MedAccountTopupWhereInput = {};

  if (status) where.status = status;

  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      // `dateTo` is a day and the caller means the whole of it — without this a top-up
      // paid at 14:00 would fall outside a range ending on its own date.
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
    prismaClient.medAccountTopup.count({ where }),
    prismaClient.medAccountTopup.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: {
          select: { phone: true, patient: { select: { fullName: true, iin: true } } },
        },
      },
    }),
    // Summed over the whole filtered set rather than the page — the dashboard shows it as
    // the header figure for the active filters.
    prismaClient.medAccountTopup.aggregate({ where, _sum: { amount: true } }),
  ]);

  const items: MedAccountTopupAdminDto[] = rows.map(({ user, ...topup }) => ({
    ...toTopupDto(topup),
    userId: topup.userId,
    beneficiaryId: topup.beneficiaryId,
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

/**
 * Moves a top-up along, or attaches an operator's note.
 *
 * `creditedAt` follows `status` rather than being editable on its own: it is the moment
 * the money landed on the medical account, and letting the two disagree would make the
 * queue lie about what has actually been posted on the insurer's side.
 */
export const updateTopup = async (
  id: string,
  body: UpdateMedAccountTopupBody
): Promise<{ topup: MedAccountTopupDto; previousStatus: MedAccountTopupStatus }> => {
  const existing = await prismaClient.medAccountTopup.findUnique({ where: { id } });

  if (!existing) {
    throw new AppError(ErrorCodes.MED_ACCOUNT_TOPUP_NOT_FOUND, 404);
  }

  const data: Prisma.MedAccountTopupUpdateInput = {};

  if (body.comment !== undefined) data.comment = body.comment;

  if (body.status !== undefined) {
    data.status = body.status;
    data.creditedAt =
      body.status === MedAccountTopupStatus.CREDITED ? (existing.creditedAt ?? new Date()) : null;
  }

  const topup = await prismaClient.medAccountTopup.update({ where: { id }, data });

  return { topup: toTopupDto(topup), previousStatus: existing.status };
};

export { MedAccountTopupStatus };
