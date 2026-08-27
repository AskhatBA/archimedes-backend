import { Request, Response } from 'express';
import { ProgramOrderCategory, ProgramOrderStatus } from '@prisma/client';
import { ValidationChain, body, validationResult } from 'express-validator';

import { AppError } from '@/shared/services/app-error.service';
import { ErrorCodes } from '@/shared/constants/error-codes';
import * as auditLogService from '@/shared/services/audit-log.service';
import { AuditEvent } from '@/shared/services/audit-log.service';

import * as programOrdersService from './program-orders.service';
import type { UpdateProgramOrderBody } from './program-orders.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const parsePositiveInt = (value: unknown, fallback: number, max?: number): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return max ? Math.min(parsed, max) : parsed;
};

const parseEnum = <T extends Record<string, string>>(
  enumeration: T,
  value: unknown,
  field: string
): T[keyof T] | undefined => {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !(value in enumeration)) {
    throw new AppError(`Invalid ${field}`, 400);
  }
  return value as T[keyof T];
};

const updateRules: ValidationChain[] = [
  body('status')
    .optional()
    .isIn(Object.keys(ProgramOrderStatus))
    .withMessage(`status must be one of: ${Object.keys(ProgramOrderStatus).join(', ')}`),
  body('comment')
    .optional({ values: 'null' })
    .isString()
    .bail()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('comment must be at most 2000 characters'),
];

/** Runs the chains and returns true when the request already answered with a 400. */
const failedValidation = async (
  req: Request,
  res: Response,
  chains: ValidationChain[]
): Promise<boolean> => {
  await Promise.all(chains.map((chain) => chain.run(req)));

  const errors = validationResult(req);

  if (errors.isEmpty()) return false;

  res.status(400).json({ success: false, errors: errors.array() });

  return true;
};

export const getMyOrders = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);

  const orders = await programOrdersService.getUserOrders(req.user.id);

  res.status(200).json({ success: true, orders });
};

export const getMyOrder = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);

  const order = await programOrdersService.getUserOrderById(req.user.id, req.params.id as string);

  res.status(200).json({ success: true, order });
};

export const getAdminOrders = async (req: Request, res: Response): Promise<void> => {
  const result = await programOrdersService.getAdminOrders({
    page: parsePositiveInt(req.query.page, 1),
    limit: parsePositiveInt(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT),
    search: typeof req.query.search === 'string' ? req.query.search.trim() : undefined,
    status: parseEnum(ProgramOrderStatus, req.query.status, 'status'),
    category: parseEnum(ProgramOrderCategory, req.query.category, 'category'),
    dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
    dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
  });

  res.status(200).json({ success: true, ...result });
};

export const getAdminOrder = async (req: Request, res: Response): Promise<void> => {
  const order = await programOrdersService.getAdminOrderById(req.params.id as string);

  res.status(200).json({ success: true, order });
};

export const updateAdminOrder = async (req: Request, res: Response): Promise<void> => {
  if (await failedValidation(req, res, updateRules)) return;

  const { order, previousStatus } = await programOrdersService.updateOrder(
    req.params.id as string,
    req.body as UpdateProgramOrderBody
  );

  // Only a status move is worth a trail entry — a comment edit changes nothing about
  // what the clinic owes the patient.
  if (order.status !== previousStatus) {
    auditLogService.log({
      event: AuditEvent.PROGRAM_ORDER_STATUS_CHANGED,
      success: true,
      userId: req.user?.id,
      phone: req.user?.phone,
      req,
      metadata: { orderId: order.id, from: previousStatus, to: order.status },
    });
  }

  res.status(200).json({ success: true, order });
};
