import { Request, Response } from 'express';
import { MedAccountTopupStatus } from '@prisma/client';
import { ValidationChain, body, validationResult } from 'express-validator';

import * as auditLogService from '@/shared/services/audit-log.service';
import { AuditEvent } from '@/shared/services/audit-log.service';

import * as medAccountService from './med-account.service';
import type {
  CreateMedAccountOptionBody,
  UpdateMedAccountOptionBody,
  UpdateMedAccountTopupBody,
} from './med-account.dto';

/** A top-up is a round sum in tenge; the app renders it as a whole number, not a price. */
const MAX_AMOUNT = 10_000_000;

/**
 * The write payload. `optional` makes every rule skippable, which turns the same rules
 * into a PATCH validator — an absent field is left untouched by the service, a present one
 * is validated exactly as on create.
 */
const optionRules = (optional: boolean): ValidationChain[] => {
  const maybe = (chain: ValidationChain) => (optional ? chain.optional() : chain);

  return [
    maybe(body('amount'))
      .isInt({ min: 1, max: MAX_AMOUNT })
      .withMessage(`amount must be a whole number of tenge between 1 and ${MAX_AMOUNT}`)
      .toInt(),
    body('label')
      .optional({ values: 'null' })
      .isString()
      .bail()
      .trim()
      .isLength({ max: 200 })
      .withMessage('label must be at most 200 characters'),
    body('popular').optional().isBoolean().withMessage('popular must be a boolean').toBoolean(),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean').toBoolean(),
    body('sortOrder')
      .optional()
      .isInt({ min: 0 })
      .withMessage('sortOrder must be a non-negative integer')
      .toInt(),
  ];
};

const topupRules = (): ValidationChain[] => [
  body('status')
    .optional()
    .isIn(Object.values(MedAccountTopupStatus))
    .withMessage(`status must be one of ${Object.values(MedAccountTopupStatus).join(', ')}`),
  body('comment')
    .optional({ values: 'null' })
    .isString()
    .bail()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('comment must be at most 1000 characters'),
];

/** Runs the chains and returns true when the request already answered with a 400. */
const failedValidation = async (
  req: Request,
  res: Response,
  chains: ValidationChain[]
): Promise<boolean> => {
  await Promise.all(chains.map((chain) => chain.run(req)));

  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return false;
  }

  res.status(400).json({ success: false, errors: errors.array() });

  return true;
};

/* ------------------------------- app-facing ------------------------------- */

export const getOptions = async (_req: Request, res: Response): Promise<void> => {
  const options = await medAccountService.getOptions();

  res.status(200).json({ success: true, options });
};

export const getMyTopups = async (req: Request, res: Response): Promise<void> => {
  const topups = await medAccountService.getUserTopups(req.user!.id);

  res.status(200).json({ success: true, topups });
};

/* --------------------------------- admin ---------------------------------- */

export const getAdminOptions = async (_req: Request, res: Response): Promise<void> => {
  const options = await medAccountService.getAdminOptions();

  res.status(200).json({ success: true, options });
};

export const createOption = async (req: Request, res: Response): Promise<void> => {
  if (await failedValidation(req, res, optionRules(false))) {
    return;
  }

  const option = await medAccountService.createOption(req.body as CreateMedAccountOptionBody);

  auditLogService.log({
    event: AuditEvent.MED_ACCOUNT_TOPUP_OPTION_CREATED,
    success: true,
    userId: req.user?.id,
    phone: req.user?.phone,
    req,
    metadata: { optionId: option.id, amount: option.amount },
  });

  res.status(201).json({ success: true, option });
};

export const updateOption = async (req: Request, res: Response): Promise<void> => {
  if (await failedValidation(req, res, optionRules(true))) {
    return;
  }

  const option = await medAccountService.updateOption(
    req.params.id as string,
    req.body as UpdateMedAccountOptionBody
  );

  auditLogService.log({
    event: AuditEvent.MED_ACCOUNT_TOPUP_OPTION_UPDATED,
    success: true,
    userId: req.user?.id,
    phone: req.user?.phone,
    req,
    // Which fields the edit touched — enough to review a change without storing the whole
    // before/after payload.
    metadata: { optionId: option.id, amount: option.amount, fields: Object.keys(req.body ?? {}) },
  });

  res.status(200).json({ success: true, option });
};

export const deleteOption = async (req: Request, res: Response): Promise<void> => {
  const option = await medAccountService.deleteOption(req.params.id as string);

  auditLogService.log({
    event: AuditEvent.MED_ACCOUNT_TOPUP_OPTION_DELETED,
    success: true,
    userId: req.user?.id,
    phone: req.user?.phone,
    req,
    metadata: { optionId: option.id, amount: option.amount },
  });

  res.status(200).json({ success: true, option });
};

const parseStatus = (value: unknown): MedAccountTopupStatus | undefined =>
  typeof value === 'string' && value in MedAccountTopupStatus
    ? (value as MedAccountTopupStatus)
    : undefined;

export const getAdminTopups = async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  const result = await medAccountService.getAdminTopups({
    page,
    limit,
    search: typeof req.query.search === 'string' ? req.query.search.trim() : undefined,
    status: parseStatus(req.query.status),
    dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
    dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
  });

  res.status(200).json({ success: true, ...result });
};

export const updateTopup = async (req: Request, res: Response): Promise<void> => {
  if (await failedValidation(req, res, topupRules())) {
    return;
  }

  const { topup, previousStatus } = await medAccountService.updateTopup(
    req.params.id as string,
    req.body as UpdateMedAccountTopupBody
  );

  if (topup.status !== previousStatus) {
    auditLogService.log({
      event: AuditEvent.MED_ACCOUNT_TOPUP_STATUS_CHANGED,
      success: true,
      userId: req.user?.id,
      phone: req.user?.phone,
      req,
      metadata: {
        topupId: topup.id,
        amount: topup.amount,
        from: previousStatus,
        to: topup.status,
      },
    });
  }

  res.status(200).json({ success: true, topup });
};
