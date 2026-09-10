/**
 * ⚠️ TEMPORARY — SANDBOX ONLY. DELETE BEFORE THIS GOES ANYWHERE NEAR REAL PATIENTS.
 *
 * Calls the insurer's `/v3/topupBalance` directly, bypassing FreedomPay entirely, so the
 * credit path can be exercised without paying for a top-up first. It writes nothing to our
 * tables: no `Payment`, no `MedAccountTopup`, no audit row — only the outbound call is
 * real, and on the insurer's side the money genuinely lands on the medical account.
 *
 * To remove it: delete this file and the block it is registered in at the bottom of
 * `med-account.routes.ts`. Nothing else imports it; the only trace it leaves in production
 * code is that `buildTopupPayload` is exported from `med-account.credit.service.ts`.
 */
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';

import type { TopupBalancePayload } from '@/domains/insurance/insurance.types';
import * as insuranceService from '@/domains/insurance/insurance.service';
import { ErrorCodes } from '@/shared/constants/error-codes';
import { createLogger } from '@/shared/lib/logger';
import { AppError } from '@/shared/services/app-error.service';

import { buildTopupPayload, resolveBeneficiaryId } from './med-account.credit.service';

const sandboxLogger = createLogger('med-account-sandbox');

const MAX_AMOUNT = 10_000_000;

/**
 * Every field of the insurer's body can be overridden from the request, so the awkward
 * cases can be provoked on demand — a patient with no program (`insuranceId: null`), a
 * foreign IIN, a name the insurer might not match. Anything left out falls back to what the
 * paid path would have sent for the caller.
 */
const rules = () => [
  body('amount')
    .isInt({ min: 1, max: MAX_AMOUNT })
    .withMessage(`amount must be a whole number of tenge between 1 and ${MAX_AMOUNT}`)
    .toInt(),
  body('beneficiaryId').optional().isString(),
  body('insuranceId').optional({ values: 'null' }).isString(),
  body('lastName').optional().isString(),
  body('firstName').optional().isString(),
  body('middleName').optional({ values: 'null' }).isString(),
  body('iin').optional().isString(),
  body('dateBirth').optional().isString(),
  body('phoneMobile').optional().isString(),
];

export const topupDirectly = async (req: Request, res: Response): Promise<void> => {
  await Promise.all(rules().map((rule) => rule.run(req)));

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, message: errors.array() });
    return;
  }

  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  if (!req.user.patient) {
    throw new AppError(ErrorCodes.PATIENT_PROFILE_NOT_FOUND, 401);
  }

  const overrides = req.body as Partial<TopupBalancePayload> & { beneficiaryId?: string };

  const beneficiaryId =
    overrides.beneficiaryId ?? (await resolveBeneficiaryId(req.user.id, req.user.phone));

  if (!beneficiaryId) {
    throw new AppError('Не удалось определить beneficiaryId в МИС', 502);
  }

  const defaults = await buildTopupPayload({
    beneficiaryId,
    amount: overrides.amount as number,
    patient: req.user.patient,
    phone: req.user.phone,
  });

  // `insuranceId: null` is a meaningful value, so the overrides are merged key by key rather
  // than by truthiness — a `null` or empty string sent on purpose must survive.
  const payload: TopupBalancePayload = { ...defaults };

  for (const key of Object.keys(defaults) as (keyof TopupBalancePayload)[]) {
    if (overrides[key] !== undefined) {
      Object.assign(payload, { [key]: overrides[key] });
    }
  }

  sandboxLogger.warn(
    {
      userId: req.user.id,
      beneficiaryId,
      insuranceId: payload.insuranceId,
      amount: payload.amount,
    },
    'SANDBOX med-account topup — crediting the insurer without a payment'
  );

  try {
    const response = await insuranceService.topupMedAccount(beneficiaryId, payload);

    res.status(200).json({ success: true, beneficiaryId, request: payload, response });
  } catch (error) {
    // The insurer's own refusal is the interesting part of a test run, so it comes back as
    // a body to read rather than as a 502 the client has to guess at.
    res.status(200).json({
      success: false,
      beneficiaryId,
      request: payload,
      error: String((error as Error)?.message || error),
    });
  }
};
