import { Request, Response } from 'express';
import { ValidationChain, body, validationResult } from 'express-validator';

import * as auditLogService from '@/shared/services/audit-log.service';
import { AuditEvent } from '@/shared/services/audit-log.service';

import * as checkupsService from './checkups.service';
import type { CreateCheckupBody, UpdateCheckupBody } from './checkups.dto';

/** Lowercase slug — it ends up in URLs and in the seed script's upsert key. */
const CODE_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The write payload. `optional` makes every rule skippable, which is what turns the
 * same set of rules into a PATCH validator — a field that is absent is left untouched
 * by the service, a field that is present is validated the same way as on create.
 */
const checkupRules = (optional: boolean): ValidationChain[] => {
  const maybe = (chain: ValidationChain) => (optional ? chain.optional() : chain);

  return [
    maybe(body('code'))
      .isString()
      .bail()
      .trim()
      .matches(CODE_REGEX)
      .withMessage('code must be a lowercase slug, e.g. "womens-health"')
      .isLength({ max: 64 })
      .withMessage('code must be at most 64 characters'),
    maybe(body('title'))
      .isString()
      .bail()
      .trim()
      .notEmpty()
      .withMessage('title is required')
      .isLength({ max: 200 })
      .withMessage('title must be at most 200 characters'),
    maybe(body('price'))
      .isInt({ min: 0 })
      .withMessage('price must be a non-negative integer (tenge)')
      .toInt(),
    maybe(body('services'))
      .isArray({ min: 1 })
      .withMessage('services must contain at least one entry'),
    body('services.*')
      .optional()
      .isString()
      .bail()
      .trim()
      .notEmpty()
      .withMessage('services entries must be non-empty strings'),
    body('description').optional({ values: 'null' }).isString().trim(),
    body('duration').optional({ values: 'null' }).isString().trim(),
    body('coverage')
      .optional()
      .isIn(['PERSONAL', 'FAMILY'])
      .withMessage('coverage must be "PERSONAL" or "FAMILY"'),
    body('popular').optional().isBoolean().withMessage('popular must be a boolean').toBoolean(),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean').toBoolean(),
    body('sortOrder')
      .optional()
      .isInt({ min: 0 })
      .withMessage('sortOrder must be a non-negative integer')
      .toInt(),
  ];
};

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

export const getCheckups = async (_req: Request, res: Response): Promise<void> => {
  const checkups = await checkupsService.getCheckups();

  res.status(200).json({ success: true, checkups });
};

export const getCheckup = async (req: Request, res: Response): Promise<void> => {
  const checkup = await checkupsService.getCheckupById(req.params.id as string);

  res.status(200).json({ success: true, checkup });
};

export const getAdminCheckups = async (_req: Request, res: Response): Promise<void> => {
  const checkups = await checkupsService.getAdminCheckups();

  res.status(200).json({ success: true, checkups });
};

export const createCheckup = async (req: Request, res: Response): Promise<void> => {
  if (await failedValidation(req, res, checkupRules(false))) {
    return;
  }

  const checkup = await checkupsService.createCheckup(req.body as CreateCheckupBody);

  auditLogService.log({
    event: AuditEvent.CHECKUP_CREATED,
    success: true,
    userId: req.user?.id,
    phone: req.user?.phone,
    req,
    metadata: { checkupId: checkup.id, code: checkup.code },
  });

  res.status(201).json({ success: true, checkup });
};

export const updateCheckup = async (req: Request, res: Response): Promise<void> => {
  if (await failedValidation(req, res, checkupRules(true))) {
    return;
  }

  const checkup = await checkupsService.updateCheckup(
    req.params.id as string,
    req.body as UpdateCheckupBody
  );

  auditLogService.log({
    event: AuditEvent.CHECKUP_UPDATED,
    success: true,
    userId: req.user?.id,
    phone: req.user?.phone,
    req,
    metadata: {
      checkupId: checkup.id,
      code: checkup.code,
      // Which fields the edit touched — enough to review a change without storing the
      // whole before/after payload.
      fields: Object.keys(req.body ?? {}),
    },
  });

  res.status(200).json({ success: true, checkup });
};

export const deleteCheckup = async (req: Request, res: Response): Promise<void> => {
  const checkup = await checkupsService.deleteCheckup(req.params.id as string);

  auditLogService.log({
    event: AuditEvent.CHECKUP_DELETED,
    success: true,
    userId: req.user?.id,
    phone: req.user?.phone,
    req,
    metadata: { checkupId: checkup.id, code: checkup.code, title: checkup.title },
  });

  res.status(200).json({ success: true, checkup });
};
