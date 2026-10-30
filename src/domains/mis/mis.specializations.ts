import { MISSpecialization } from './mis.types';

/**
 * Specialty filters for `GET /mis/specializations`.
 *
 * Kept free of config and I/O so the rules can be tested on their own; the caller passes
 * the lists from `config`.
 */

/** Drops every specialty whose name contains one of `excluded` (case-insensitive). */
const excludeByName = <T extends Pick<MISSpecialization, 'name'>>(
  specializations: T[],
  excluded: readonly string[]
): T[] => {
  const patterns = excluded.map((pattern) => pattern.trim().toUpperCase()).filter(Boolean);

  if (patterns.length === 0) return specializations;

  return specializations.filter((specialization) => {
    const name = (specialization.name ?? '').toUpperCase();
    return !patterns.some((pattern) => name.includes(pattern));
  });
};

/**
 * Drops the specialties a telemedicine visit cannot be booked with: any whose name contains
 * one of `excluded` (case-insensitive, both sides upper-cased).
 *
 * The caller passes `config.telemedicine.excludedSpecialties`.
 */
export const filterTelemedicineSpecializations = <T extends Pick<MISSpecialization, 'name'>>(
  specializations: T[],
  excluded: readonly string[]
): T[] => excludeByName(specializations, excluded);

/**
 * Drops the specialties a branch does not offer under insurance cover: the patterns listed
 * for `branchId` in `hiddenByBranch`, matched like the telemedicine ones. Any other branch
 * gets the list untouched.
 *
 * Only for a visit booked under an insurance program that is not the medical account — the
 * caller decides that; med-account and paid visits see the MIS list as is. The caller passes
 * `config.mis.insuredHiddenSpecialties`.
 */
export const filterInsuredSpecializations = <T extends Pick<MISSpecialization, 'name'>>(
  specializations: T[],
  branchId: string,
  hiddenByBranch: Readonly<Record<string, readonly string[]>>
): T[] => excludeByName(specializations, hiddenByBranch[branchId] ?? []);
