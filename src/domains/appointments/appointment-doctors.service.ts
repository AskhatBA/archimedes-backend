import * as misService from '@/domains/mis/mis.service';
import { createLogger } from '@/shared/lib/logger';

/**
 * Puts a name on `Appointment.doctorId`, which is a MIS id and nothing more.
 *
 * Shared by the dashboard listing and the patient's own history, so both hit one cache.
 * It lives apart from `appointments.service` because it needs `mis.service`, and
 * `mis.service` already imports `appointments.service` for the booking conflict rules —
 * reaching for MIS from there would close that import cycle.
 */

const doctorsLogger = createLogger('appointment-doctors');

export type DoctorSummary = {
  name: string | null;
  specialty: string | null;
  branch: string | null;
  branchAddress: string | null;
};

export const UNKNOWN_DOCTOR: DoctorSummary = {
  name: null,
  specialty: null,
  branch: null,
  branchAddress: null,
};

/**
 * MIS is asked once per doctor per page, and the answer is held for a while: a day's
 * appointments are spread over a handful of doctors, so without this a single page would
 * fire twenty near-identical lookups at the clinic's API.
 */
const DOCTOR_CACHE_TTL_MS = 10 * 60 * 1000;

const doctorCache = new Map<string, { doctor: DoctorSummary; expiresAt: number }>();

const readDoctor = async (doctorId: string): Promise<DoctorSummary> => {
  const cached = doctorCache.get(doctorId);

  if (cached && cached.expiresAt > Date.now()) return cached.doctor;

  try {
    const details = await misService.getDoctorDetailsById(doctorId);
    const doctor: DoctorSummary = {
      name: details.name || null,
      specialty: details.specialty?.name || null,
      branch: details.branch?.name || null,
      branchAddress: details.branch?.address || null,
    };

    doctorCache.set(doctorId, { doctor, expiresAt: Date.now() + DOCTOR_CACHE_TTL_MS });

    return doctor;
  } catch (error) {
    // A MIS outage must not empty a list — the row keeps its `doctorId` and the caller
    // shows that, or nothing, instead of a name.
    doctorsLogger.warn({ err: error, doctorId }, 'Failed to resolve doctor from MIS');

    return UNKNOWN_DOCTOR;
  }
};

export const readDoctors = async (doctorIds: string[]): Promise<Map<string, DoctorSummary>> => {
  const unique = [...new Set(doctorIds)];
  const resolved = await Promise.all(unique.map((id) => readDoctor(id)));

  return new Map(unique.map((id, index) => [id, resolved[index] as DoctorSummary]));
};
