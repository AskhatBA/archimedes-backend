import { PaymentPurpose } from '@prisma/client';

import {
  PaymentSuccessContext,
  registerPaymentPurposeHandler,
} from '@/domains/payment/payment.post-success.service';
import { prismaClient } from '@/infrastructure/db';
import { ErrorCodes } from '@/shared/constants/error-codes';
import { createLogger } from '@/shared/lib/logger';
import { enqueueMedAccountCredit } from '@/shared/queues/med-account-credit.queue';
import { AppError } from '@/shared/services/app-error.service';
import * as auditLogService from '@/shared/services/audit-log.service';
import { AuditEvent } from '@/shared/services/audit-log.service';

import { resolveBeneficiaryId } from './med-account.credit.service';
import * as medAccountService from './med-account.service';
import type { MedAccountTopupMetadata } from './med-account.dto';

const handlerLogger = createLogger('med-account-payment');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates the top-up the app is about to send the payer to pay for.
 *
 * Runs at `/payment/init`, before the payment record exists. Only the option is carried:
 * the amount is the catalogue's, not the client's, so there is nothing here for a tampered
 * payload to move.
 */
const validateMetadata = (metadata: unknown): MedAccountTopupMetadata => {
  if (typeof metadata !== 'object' || metadata === null) {
    throw new AppError('metadata is required for a med-account top-up', 400);
  }

  const { optionId } = metadata as Record<string, unknown>;

  if (typeof optionId !== 'string' || !UUID_REGEX.test(optionId)) {
    throw new AppError('metadata.optionId must be a med-account option id', 400);
  }

  return { optionId };
};

/**
 * Refuses a top-up that could not be honoured.
 *
 * The amount on the screen is cached on the device, so it can disagree with the catalogue
 * by the time the payer taps through — and the amount is what actually gets charged. Both
 * checks happen here, while the payer still has an unspent card, rather than after the
 * money has moved.
 */
const ensureTopupIsPayable = async ({
  amount,
  metadata,
}: {
  userId: string;
  amount: number;
  metadata: MedAccountTopupMetadata;
}): Promise<void> => {
  const option = await prismaClient.medAccountTopupOption.findUnique({
    where: { id: metadata.optionId },
  });

  if (!option || !option.isActive) {
    throw new AppError(ErrorCodes.MED_ACCOUNT_OPTION_NOT_FOUND, 404);
  }

  if (option.amount !== amount) {
    throw new AppError(ErrorCodes.MED_ACCOUNT_TOPUP_AMOUNT_MISMATCH, 409);
  }
};

/**
 * Records the top-up the patient has just paid for and hands it on to be credited.
 *
 * Runs when the payment settles as SUCCESS — from the FreedomPay result callback or from
 * the background reconciliation sweep — so the row lands even if the app was closed on the
 * provider's page.
 *
 * The insurer call is only *enqueued*: the result callback waits on this handler, and the
 * medical account lives in someone else's system. Failing to enqueue is logged and
 * swallowed — the top-up is already recorded and visible in the dashboard, and losing the
 * job must not fail a payment that went through.
 */
const recordTopup = async (context: PaymentSuccessContext): Promise<void> => {
  const metadata = validateMetadata(context.metadata);

  const user = await prismaClient.user.findUnique({
    where: { id: context.userId },
    select: { phone: true },
  });

  const option = await prismaClient.medAccountTopupOption.findUnique({
    where: { id: metadata.optionId },
    select: { id: true },
  });

  const topup = await medAccountService.createTopupForPayment({
    userId: context.userId,
    paymentId: context.paymentId,
    // The amount charged is authoritative — the option may have been repriced or removed
    // between the payment starting and settling, but what was paid cannot change.
    amount: Math.round(context.amount),
    optionId: option?.id ?? null,
    beneficiaryId: user ? await resolveBeneficiaryId(context.userId, user.phone) : null,
  });

  handlerLogger.info(
    { topupId: topup.id, paymentId: context.paymentId, userId: context.userId, amount: topup.amount },
    'Med-account topup recorded after successful payment'
  );

  try {
    await enqueueMedAccountCredit(topup.id);
  } catch (error) {
    handlerLogger.error(
      { err: error, topupId: topup.id, paymentId: context.paymentId },
      'Failed to queue med-account topup credit'
    );
  }

  auditLogService.log({
    event: AuditEvent.MED_ACCOUNT_TOPUP_CREATED,
    success: true,
    userId: context.userId,
    metadata: { topupId: topup.id, paymentId: context.paymentId, amount: topup.amount },
  });
};

export const registerMedAccountPaymentHandler = (): void => {
  registerPaymentPurposeHandler<MedAccountTopupMetadata>(PaymentPurpose.MED_ACCOUNT_TOPUP, {
    validateMetadata,
    beforePayment: ensureTopupIsPayable,
    onSuccess: recordTopup,
  });
};
