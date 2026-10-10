import { MISSpecialization } from './mis.types';

/**
 * Drops the specialties a telemedicine visit cannot be booked with: any whose name contains
 * one of `excluded` (case-insensitive, both sides upper-cased).
 *
 * Kept free of config and I/O so the rule can be tested on its own; the caller passes
 * `config.telemedicine.excludedSpecialties`.
 */
export const filterTelemedicineSpecializations = <T extends Pick<MISSpecialization, 'name'>>(
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
