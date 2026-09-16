import { Prisma } from '@prisma/client';

import * as misService from '@/domains/mis/mis.service';
import * as db from '@/infrastructure/db';
import { ErrorCodes } from '@/shared/constants/error-codes';
import { AppError } from '@/shared/services/app-error.service';

import { AdminUpdatePatientBody, AdminUpdatePatientResult } from './patient.dto';
import { PATIENT_LIST_SELECT, toListItem } from './patient.service';

/**
 * The dashboard's write side of the patient profile.
 *
 * It lives apart from `patient.service` because a changed IIN has to be re-resolved in
 * MIS, and `mis.service` already imports `patient.service` — reaching for MIS from there
 * would close that import cycle.
 */

/**
 * `fullName` is left out on purpose. Some rows hold a `fullName` ciphertext that no longer
 * decrypts (see `PATIENT_LIST_SELECT`), and reading it throws inside the Prisma extension —
 * which would make exactly those rows impossible to edit or delete.
 */
const PATIENT_EDIT_SELECT = {
  id: true,
  userId: true,
  firstName: true,
  lastName: true,
  patronymic: true,
  iin: true,
  misPatientId: true,
} satisfies Prisma.PatientSelect;

const isPrismaError = (err: unknown, code: string): err is Prisma.PrismaClientKnownRequestError =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;

const findOr404 = async (id: string) => {
  const patient = await db.prismaClient.patient.findUnique({
    where: { id },
    select: PATIENT_EDIT_SELECT,
  });

  if (!patient) {
    throw new AppError(ErrorCodes.PATIENT_PROFILE_NOT_FOUND, 404);
  }

  return patient;
};

const assertIinIsFree = async (iin: string, exceptId: string) => {
  const existing = await db.prismaClient.patient.findUnique({
    where: { iin },
    select: { id: true },
  });

  if (existing && existing.id !== exceptId) {
    throw new AppError(ErrorCodes.PATIENT_IIN_TAKEN, 409);
  }
};

/**
 * `misPatientId` is what every MIS call for this account is keyed by — visits, history,
 * lab results. It was resolved from the IIN, so a new IIN has to be resolved again:
 * keeping the old id would show one person's medical record under another person's IIN.
 *
 * An IIN MIS does not know is refused rather than saved with a stale link. `misRequest`
 * folds network errors and 401s into 404, so an unreachable MIS lands here too — either
 * way the edit cannot be made safely right now.
 */
const resolveMisPatientId = async (iin: string, exceptId: string): Promise<string> => {
  const misPatient = await misService.findPatientByIinAndPhone(iin).catch((err: unknown) => {
    if (err instanceof AppError && err.statusCode === 404) {
      return undefined;
    }

    throw err;
  });

  // `findPatientByIinAndPhone` only matches the IIN when MIS answers with several
  // beneficiaries; a single one is taken as is. Linking the wrong person here would open
  // their medical record, so the answer has to be for the IIN that was asked.
  if (!misPatient?.id || misPatient.iin !== iin) {
    throw new AppError(ErrorCodes.MIS_PATIENT_NOT_FOUND, 400);
  }

  const linked = await db.prismaClient.patient.findUnique({
    where: { misPatientId: misPatient.id },
    select: { id: true },
  });

  if (linked && linked.id !== exceptId) {
    throw new AppError(ErrorCodes.PATIENT_MIS_PATIENT_TAKEN, 409);
  }

  return misPatient.id;
};

/** The pre-checks can race a registration; the unique indexes are the real guard. */
const toConflict = (err: unknown): unknown => {
  if (isPrismaError(err, 'P2002')) {
    const target = String(err.meta?.target ?? '');

    return new AppError(
      target.includes('misPatientId')
        ? ErrorCodes.PATIENT_MIS_PATIENT_TAKEN
        : ErrorCodes.PATIENT_IIN_TAKEN,
      409
    );
  }

  if (isPrismaError(err, 'P2025')) {
    return new AppError(ErrorCodes.PATIENT_PROFILE_NOT_FOUND, 404);
  }

  return err;
};

/**
 * Partial update of the name parts and the IIN. Only the keys the dashboard sent are
 * written, so an edit never blanks a field the admin left alone.
 */
export const updatePatient = async (
  id: string,
  body: AdminUpdatePatientBody
): Promise<AdminUpdatePatientResult> => {
  const current = await findOr404(id);

  const next = {
    firstName: body.firstName ?? current.firstName,
    lastName: body.lastName ?? current.lastName,
    patronymic: body.patronymic === undefined ? current.patronymic : (body.patronymic ?? ''),
    iin: body.iin ?? current.iin,
  };

  const changedFields = (Object.keys(next) as (keyof typeof next)[]).filter(
    (field) => next[field] !== current[field]
  );

  const iinChanged = next.iin !== current.iin;
  let misPatientId = current.misPatientId;

  if (iinChanged) {
    // Cheap local check first, so a duplicate never costs a round trip to MIS.
    await assertIinIsFree(next.iin, id);
    misPatientId = await resolveMisPatientId(next.iin, id);
  }

  let updated;

  try {
    updated = await db.prismaClient.patient.update({
      where: { id },
      data: {
        firstName: next.firstName,
        lastName: next.lastName,
        patronymic: next.patronymic,
        // Composed the same way registration does. Rewritten on every edit, not only when a
        // name part changes: re-encrypting it under the current key also repairs a row whose
        // stored `fullName` no longer decrypts.
        fullName: `${next.firstName} ${next.lastName}`,
        ...(iinChanged && { iin: next.iin, misPatientId }),
      },
      select: PATIENT_LIST_SELECT,
    });
  } catch (err) {
    throw toConflict(err);
  }

  return {
    patient: toListItem(updated),
    changedFields,
    ...(iinChanged && {
      relinked: { previousIin: current.iin, previousMisPatientId: current.misPatientId },
    }),
  };
};

/**
 * Removes the patient profile and nothing else. The `User` row — phone, PIN, payments,
 * appointments, orders — stays, so the account can still sign in by phone and fill in a
 * new profile from the app (`POST /patient/profile`). Nothing references `Patient.id`, so
 * the delete cascades nowhere.
 */
export const deletePatient = async (id: string) => {
  try {
    return await db.prismaClient.patient.delete({
      where: { id },
      select: { id: true, userId: true, iin: true, misPatientId: true },
    });
  } catch (err) {
    throw toConflict(err);
  }
};
