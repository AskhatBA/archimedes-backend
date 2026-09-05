import { MedAccountTopupStatus } from '@prisma/client';

import { config } from '@/config';
import { prismaClient } from '@/infrastructure/db';
import * as misService from '@/domains/mis/mis.service';
import { createLogger } from '@/shared/lib/logger';
import * as auditLogService from '@/shared/services/audit-log.service';
import { AuditEvent } from '@/shared/services/audit-log.service';

const creditLogger = createLogger('med-account-credit');

/**
 * Thrown by `creditViaInsurer` until the insurer ships the endpoint. Distinct from a
 * transport failure so the queue can tell "not built yet" from "the insurer said no".
 */
export class MedAccountCreditNotImplementedError extends Error {
  constructor() {
    super('MED_ACCOUNT_CREDIT_NOT_IMPLEMENTED');
    this.name = 'MedAccountCreditNotImplementedError';
  }
}

/**
 * Posts a paid top-up onto the patient's medical account in the insurer's system.
 *
 * **This is the one function to fill in when the insurer ships the endpoint.** Their API
 * is read-only for the medical account today — `insurance.constants.ts` declares only
 * `/v3/getMedAccount` — so nothing here can move money on their side yet, and everything
 * around this function is already built for the day it can:
 *
 * 1. add the path to `insurance.constants.ts` and a wrapper to `insurance.service.ts`,
 *    the same way `getMedAccount` is declared;
 * 2. replace the throw below with that call and return whatever reference it answers
 *    with (a transaction id, a document number) — it is stored on the top-up and is what
 *    an operator reconciles against;
 * 3. set `MED_ACCOUNT_CREDIT_ENABLED=true`.
 *
 * Until then every paid top-up stays `PENDING` and is credited by an operator from the
 * dashboard, which is why the row exists at all.
 *
 * Throw to fail the credit: the caller marks the top-up `FAILED` with the message, and
 * the money is already the patient's, so a failure here is an operator's problem to pick
 * up — never a reason to lose the record.
 */
const creditViaInsurer = async (_params: {
  beneficiaryId: string;
  /** Amount in tenge. */
  amount: number;
  /** Our top-up id — pass it as the insurer's idempotency key if their API takes one. */
  topupId: string;
}): Promise<string | null> => {
  throw new MedAccountCreditNotImplementedError();
};

/**
 * Best-effort lookup of the insurer beneficiary a top-up belongs to.
 *
 * Resolved again here rather than trusted from the row: MIS can be unreachable at the
 * moment a payment settles, and a top-up whose `beneficiaryId` is null must still be
 * creditable later instead of needing an operator to dig the id out by hand.
 */
export const resolveBeneficiaryId = async (
  userId: string,
  phone: string
): Promise<string | null> => {
  try {
    const insurance = await misService.getUserInsuranceDetails(userId, phone);

    return insurance?.beneficiaryId ?? null;
  } catch (error) {
    creditLogger.warn({ err: error, userId }, 'Could not resolve beneficiary for med-account topup');

    return null;
  }
};

/**
 * Hands one paid top-up to the insurer and records what came back.
 *
 * Safe to call more than once: a top-up that is no longer `PENDING` is left alone, so a
 * retried job cannot credit the same money twice. Never throws — the payment has settled
 * and the record must survive whatever the insurer does.
 */
export const creditTopup = async (topupId: string): Promise<MedAccountTopupStatus | null> => {
  const topup = await prismaClient.medAccountTopup.findUnique({
    where: { id: topupId },
    include: { user: { select: { phone: true } } },
  });

  if (!topup) {
    creditLogger.warn({ topupId }, 'Med-account topup gone, credit skipped');
    return null;
  }

  if (topup.status !== MedAccountTopupStatus.PENDING) {
    return topup.status;
  }

  if (!config.medAccount.creditEnabled) {
    creditLogger.info(
      { topupId, amount: topup.amount, userId: topup.userId },
      'Med-account credit disabled, topup left for an operator'
    );

    return MedAccountTopupStatus.PENDING;
  }

  const beneficiaryId =
    topup.beneficiaryId ?? (await resolveBeneficiaryId(topup.userId, topup.user.phone));

  if (!beneficiaryId) {
    await prismaClient.medAccountTopup.update({
      where: { id: topupId },
      data: {
        status: MedAccountTopupStatus.FAILED,
        comment: 'Не удалось определить beneficiaryId в МИС',
      },
    });

    return MedAccountTopupStatus.FAILED;
  }

  try {
    const externalRef = await creditViaInsurer({
      beneficiaryId,
      amount: topup.amount,
      topupId: topup.id,
    });

    await prismaClient.medAccountTopup.update({
      where: { id: topupId },
      data: {
        status: MedAccountTopupStatus.CREDITED,
        beneficiaryId,
        externalRef,
        creditedAt: new Date(),
        comment: null,
      },
    });

    creditLogger.info(
      { topupId, amount: topup.amount, userId: topup.userId, externalRef },
      'Med-account topup credited'
    );

    auditLogService.log({
      event: AuditEvent.MED_ACCOUNT_TOPUP_CREDITED,
      success: true,
      userId: topup.userId,
      metadata: { topupId, amount: topup.amount, externalRef },
    });

    return MedAccountTopupStatus.CREDITED;
  } catch (error) {
    const message = String((error as Error)?.message || error).slice(0, 500);

    await prismaClient.medAccountTopup.update({
      where: { id: topupId },
      data: { status: MedAccountTopupStatus.FAILED, beneficiaryId, comment: message },
    });

    creditLogger.error(
      { err: error, topupId, amount: topup.amount, userId: topup.userId },
      'Med-account topup credit failed'
    );

    auditLogService.log({
      event: AuditEvent.MED_ACCOUNT_TOPUP_CREDITED,
      success: false,
      userId: topup.userId,
      metadata: { topupId, amount: topup.amount, error: message },
    });

    return MedAccountTopupStatus.FAILED;
  }
};
