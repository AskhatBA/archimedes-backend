import { Checkup, Prisma } from '@prisma/client';

import { prismaClient } from '@/infrastructure/db';
import { ErrorCodes } from '@/shared/constants/error-codes';
import { AppError } from '@/shared/services/app-error.service';

import type {
  CheckupAdminItem,
  CheckupItem,
  CreateCheckupBody,
  UpdateCheckupBody,
} from './checkups.dto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strips the bookkeeping columns (timestamps, ordering, active flag) the app never reads. */
const toItem = (checkup: Checkup): CheckupItem => ({
  id: checkup.id,
  code: checkup.code,
  title: checkup.title,
  description: checkup.description,
  price: checkup.price,
  duration: checkup.duration,
  coverage: checkup.coverage,
  services: checkup.services,
  popular: checkup.popular,
});

const toAdminItem = (checkup: Checkup): CheckupAdminItem => ({
  ...toItem(checkup),
  isActive: checkup.isActive,
  sortOrder: checkup.sortOrder,
  createdAt: checkup.createdAt,
  updatedAt: checkup.updatedAt,
});

export const getCheckups = async (): Promise<CheckupItem[]> => {
  const checkups = await prismaClient.checkup.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
  });

  return checkups.map(toItem);
};

/**
 * Accepts either the uuid or the stable `code`, so a deep link written against a
 * slug keeps working after a reseed hands the row a new id.
 */
export const getCheckupById = async (idOrCode: string): Promise<CheckupItem> => {
  const checkup = await prismaClient.checkup.findFirst({
    where: UUID_REGEX.test(idOrCode) ? { id: idOrCode } : { code: idOrCode },
  });

  if (!checkup || !checkup.isActive) {
    throw new AppError(ErrorCodes.CHECKUP_NOT_FOUND, 404);
  }

  return toItem(checkup);
};

/** Unlike the app-facing list, this one includes unpublished entries. */
export const getAdminCheckups = async (): Promise<CheckupAdminItem[]> => {
  const checkups = await prismaClient.checkup.findMany({
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
  });

  return checkups.map(toAdminItem);
};

const findOr404 = async (id: string): Promise<Checkup> => {
  const checkup = await prismaClient.checkup.findUnique({ where: { id } });

  if (!checkup) {
    throw new AppError(ErrorCodes.CHECKUP_NOT_FOUND, 404);
  }

  return checkup;
};

/**
 * `code` is what the seed script upserts on and what deep links point at, so a
 * collision is a conflict the admin has to resolve, not something to silently merge.
 */
const assertCodeIsFree = async (code: string, exceptId?: string) => {
  const existing = await prismaClient.checkup.findUnique({ where: { code } });

  if (existing && existing.id !== exceptId) {
    throw new AppError(ErrorCodes.CHECKUP_CODE_TAKEN, 409);
  }
};

/** New entries land at the end of the list unless the admin picked a position. */
const nextSortOrder = async (): Promise<number> => {
  const last = await prismaClient.checkup.findFirst({
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  return (last?.sortOrder ?? 0) + 10;
};

export const createCheckup = async (body: CreateCheckupBody): Promise<CheckupAdminItem> => {
  await assertCodeIsFree(body.code);

  const checkup = await prismaClient.checkup.create({
    data: {
      code: body.code,
      title: body.title,
      price: body.price,
      services: body.services,
      description: body.description ?? null,
      duration: body.duration ?? null,
      ...(body.coverage !== undefined && { coverage: body.coverage }),
      ...(body.popular !== undefined && { popular: body.popular }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      sortOrder: body.sortOrder ?? (await nextSortOrder()),
    },
  });

  return toAdminItem(checkup);
};

export const updateCheckup = async (
  id: string,
  body: UpdateCheckupBody
): Promise<CheckupAdminItem> => {
  await findOr404(id);

  if (body.code !== undefined) {
    await assertCodeIsFree(body.code, id);
  }

  // Only the keys the dashboard actually sent are written, so a partial edit never
  // blanks a field the admin left alone.
  const data: Prisma.CheckupUpdateInput = {
    ...(body.code !== undefined && { code: body.code }),
    ...(body.title !== undefined && { title: body.title }),
    ...(body.price !== undefined && { price: body.price }),
    ...(body.services !== undefined && { services: body.services }),
    ...(body.description !== undefined && { description: body.description ?? null }),
    ...(body.duration !== undefined && { duration: body.duration ?? null }),
    ...(body.coverage !== undefined && { coverage: body.coverage }),
    ...(body.popular !== undefined && { popular: body.popular }),
    ...(body.isActive !== undefined && { isActive: body.isActive }),
    ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
  };

  const checkup = await prismaClient.checkup.update({ where: { id }, data });

  return toAdminItem(checkup);
};

export const deleteCheckup = async (id: string): Promise<CheckupAdminItem> => {
  const checkup = await findOr404(id);

  await prismaClient.checkup.delete({ where: { id } });

  return toAdminItem(checkup);
};
