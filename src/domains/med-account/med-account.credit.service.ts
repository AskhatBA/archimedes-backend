import { MedAccountTopupStatus } from '@prisma/client';

import { config } from '@/config';
import { prismaClient } from '@/infrastructure/db';
import * as insuranceService from '@/domains/insurance/insurance.service';
import type { Program } from '@/domains/insurance/insurance.types';
import * as misService from '@/domains/mis/mis.service';
import { createLogger } from '@/shared/lib/logger';
import * as auditLogService from '@/shared/services/audit-log.service';
import { AuditEvent } from '@/shared/services/audit-log.service';

const creditLogger = createLogger('med-account-credit');

/** Patient details `/v3/topupBalance` identifies the payer by. */
interface CreditPatient {
  firstName: string;
  lastName: string;
  patronymic: string;
  iin: string;
  /** As stored on `Patient`: `YYYY-MM-DD`. */
  birthDate: string;
}

/**
 * Turns the `YYYY-MM-DD` we store into the ISO date-time the insurer's schema asks for.
 *
 * Midnight UTC, not local: the field carries a date and nothing else, and an offset would
 * push a birthday onto the previous day for anyone east of Greenwich — which is everyone
 * here.
 */
const toIsoDateBirth = (birthDate: string): string => {
  const parsed = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? `${birthDate}T00:00:00.000Z` : birthDate
  );

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Некорректная дата рождения пациента: ${birthDate}`);
  }

  return parsed.toISOString();
};

/** True while `program` is the one in force today, as far as its dates can tell. */
const isCurrentProgram = (program: Program, now: number): boolean => {
  const start = Date.parse(program.dateStart);
  const end = Date.parse(program.dateEnd);

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return false;
  }

  return start <= now && now <= end;
};

/**
 * The insurance program the top-up should be booked against, or `''` when there is none.
 *
 * An empty `insuranceId` is a documented, valid value — a patient who only ever pays out of
 * pocket has no program at all — so a failure to read the list is not worth failing a
 * settled payment over: it degrades to the same empty value rather than stranding the money
 * on our side. Statuses are free-form strings on the insurer's side, so the choice is made
 * on the dates, with the first program as the fallback.
 */
const resolveInsuranceProgramId = async (beneficiaryId: string): Promise<string> => {
  try {
    const programs = await insuranceService.getPrograms(beneficiaryId);

    if (!Array.isArray(programs) || programs.length === 0) {
      return '';
    }

    const now = Date.now();

    return (programs.find((program) => isCurrentProgram(program, now)) ?? programs[0]).id ?? '';
  } catch (error) {
    creditLogger.warn(
      { err: error, beneficiaryId },
      'Could not read insurance programs, crediting topup without insuranceId'
    );

    return '';
  }
};

/**
 * Picks the reference the insurer booked the transfer under.
 *
 * The field is not part of the documented response, so whichever of the plausible names
 * comes back is taken — it is only ever read by an operator reconciling our row against
 * theirs, and `null` simply means they did not hand one back.
 */
const extractExternalRef = (response: {
  transactionId?: string | number;
  documentNumber?: string | number;
  id?: string | number;
}): string | null => {
  const ref = response.transactionId ?? response.documentNumber ?? response.id;

  return ref === undefined || ref === null || ref === '' ? null : String(ref);
};

/**
 * Posts a paid top-up onto the patient's medical account in the insurer's system.
 *
 * `/v3/topupBalance` identifies the payer by their own details rather than by the
 * beneficiary id — that only authenticates the call — so the patient row travels with the
 * amount. `insuranceId` is the one field allowed to be empty, for a patient with no
 * insurance program.
 *
 * Throws to fail the credit: the caller marks the top-up `FAILED` with the message, and the
 * money has already left the patient, so a failure here is an operator's problem to pick up
 * — never a reason to lose the record.
 */
const creditViaInsurer = async ({
  beneficiaryId,
  amount,
  topupId,
  patient,
  phone,
}: {
  beneficiaryId: string;
  /** Amount in tenge. */
  amount: number;
  /** Our top-up id, logged so our row can be paired with the insurer's. */
  topupId: string;
  patient: CreditPatient;
  phone: string;
}): Promise<string | null> => {
  const insuranceId = await resolveInsuranceProgramId(beneficiaryId);

  creditLogger.debug(
    { topupId, beneficiaryId, insuranceId, amount },
    'Sending med-account topup to the insurer'
  );

  const response = await insuranceService.topupMedAccount(beneficiaryId, {
    insuranceId,
    lastName: patient.lastName,
    firstName: patient.firstName,
    middleName: patient.patronymic || '',
    iin: patient.iin,
    dateBirth: toIsoDateBirth(patient.birthDate),
    phoneMobile: phone,
    amount,
  });

  return extractExternalRef(response);
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
    creditLogger.warn(
      { err: error, userId },
      'Could not resolve beneficiary for med-account topup'
    );

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
    include: {
      user: {
        select: {
          phone: true,
          patient: {
            select: {
              firstName: true,
              lastName: true,
              patronymic: true,
              iin: true,
              birthDate: true,
            },
          },
        },
      },
    },
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

  // The insurer identifies the payer by name/IIN/date of birth, not by the beneficiary id,
  // so a user without a patient profile cannot be credited automatically at all.
  const patient = topup.user.patient;

  if (!patient) {
    await prismaClient.medAccountTopup.update({
      where: { id: topupId },
      data: {
        status: MedAccountTopupStatus.FAILED,
        beneficiaryId,
        comment: 'Нет профиля пациента — некому зачислить пополнение',
      },
    });

    return MedAccountTopupStatus.FAILED;
  }

  let externalRef: string | null;

  // The insurer call stands on its own, outside the bookkeeping below. `/v3/topupBalance`
  // takes no idempotency key, so a second call would credit the money a second time — the
  // one thing that must never happen is a failure *after* it succeeded turning into a
  // retry of it.
  try {
    externalRef = await creditViaInsurer({
      beneficiaryId,
      amount: topup.amount,
      topupId: topup.id,
      patient,
      phone: topup.user.phone,
    });
  } catch (error) {
    const message = String((error as Error)?.message || error).slice(0, 500);

    creditLogger.error(
      { err: error, topupId, amount: topup.amount, userId: topup.userId },
      'Med-account topup credit failed'
    );

    await prismaClient.medAccountTopup
      .update({
        where: { id: topupId },
        data: { status: MedAccountTopupStatus.FAILED, beneficiaryId, comment: message },
      })
      .catch((updateError: unknown) => {
        creditLogger.error(
          { err: updateError, topupId },
          'Could not mark med-account topup failed'
        );
      });

    auditLogService.log({
      event: AuditEvent.MED_ACCOUNT_TOPUP_CREDITED,
      success: false,
      userId: topup.userId,
      metadata: { topupId, amount: topup.amount, error: message },
    });

    return MedAccountTopupStatus.FAILED;
  }

  creditLogger.info(
    { topupId, amount: topup.amount, userId: topup.userId, externalRef },
    'Med-account topup credited'
  );

  // The money is on the account from here on. A write that fails now is logged and
  // swallowed rather than thrown: letting the job retry would put the money there twice,
  // and the row is left PENDING for an operator, which is the recoverable direction.
  await prismaClient.medAccountTopup
    .update({
      where: { id: topupId },
      data: {
        status: MedAccountTopupStatus.CREDITED,
        beneficiaryId,
        externalRef,
        creditedAt: new Date(),
        comment: null,
      },
    })
    .catch((error: unknown) => {
      creditLogger.error(
        { err: error, topupId, externalRef },
        'Med-account topup credited at the insurer but not recorded'
      );
    });

  auditLogService.log({
    event: AuditEvent.MED_ACCOUNT_TOPUP_CREDITED,
    success: true,
    userId: topup.userId,
    metadata: { topupId, amount: topup.amount, externalRef },
  });

  return MedAccountTopupStatus.CREDITED;
};
