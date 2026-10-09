import { Request, Response } from 'express';
import { FiscalOperationType, FiscalReceiptStatus } from '@prisma/client';

import { AppError } from '@/shared/services/app-error.service';
import * as auditLogService from '@/shared/services/audit-log.service';
import { AuditEvent } from '@/shared/services/audit-log.service';

import * as fiscalAdminService from './fiscal.admin.service';

const ADMIN_DEFAULT_LIMIT = 20;
const ADMIN_MAX_LIMIT = 100;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const parsePositiveInt = (value: unknown, fallback: number, max?: number): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return max ? Math.min(parsed, max) : parsed;
};

const parseEnum = <T extends string>(
  values: Record<string, T>,
  value: unknown,
  field: string
): T | undefined => {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !(value in values)) {
    throw new AppError(`Invalid ${field}`, 400);
  }
  return value as T;
};

const parseDay = (value: unknown, field: string): string | undefined => {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !DAY_PATTERN.test(value)) {
    throw new AppError(`${field} must be a date in YYYY-MM-DD format`, 400);
  }
  return value;
};

/** Очередь чеков: пагинация, фильтры и сумма по выборке. */
export const getAdminReceipts = async (req: Request, res: Response): Promise<void> => {
  const result = await fiscalAdminService.getAdminReceipts({
    page: parsePositiveInt(req.query.page, 1),
    limit: parsePositiveInt(req.query.limit, ADMIN_DEFAULT_LIMIT, ADMIN_MAX_LIMIT),
    status: parseEnum(FiscalReceiptStatus, req.query.status, 'status'),
    operationType: parseEnum(FiscalOperationType, req.query.operationType, 'operationType'),
    dateFrom: parseDay(req.query.dateFrom, 'dateFrom'),
    dateTo: parseDay(req.query.dateTo, 'dateTo'),
    search: typeof req.query.search === 'string' ? req.query.search.trim() || undefined : undefined,
  });

  res.status(200).json({ success: true, ...result });
};

export const getAdminReceipt = async (req: Request, res: Response): Promise<void> => {
  const receipt = await fiscalAdminService.getAdminReceiptById(req.params.id as string);

  res.status(200).json({ success: true, receipt });
};

/** Ручной повтор FAILED-чека. */
export const retryReceipt = async (req: Request, res: Response): Promise<void> => {
  const { receipt, previousError } = await fiscalAdminService.retryReceipt(req.params.id as string);

  auditLogService.log({
    event: AuditEvent.FISCAL_RECEIPT_RETRIED,
    success: true,
    userId: req.user?.id,
    phone: req.user?.phone,
    req,
    metadata: {
      receiptId: receipt.id,
      paymentId: receipt.paymentId,
      operationType: receipt.operationType,
      retryRound: receipt.retryRound,
      previousError,
    },
  });

  res.status(200).json({ success: true, receipt });
};

/** Ручной Z-отчёт. */
export const closeShift = async (_req: Request, res: Response): Promise<void> => {
  const result = await fiscalAdminService.closeShiftManually();

  res.status(200).json({ success: true, ...result });
};
