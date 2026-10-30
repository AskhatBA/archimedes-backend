import { getBeneficiaryId } from '@/domains/insurance/beneficiary.service';
import * as insuranceService from '@/domains/insurance/insurance.service';
import { createLogger } from '@/shared/lib/logger';

const programsLogger = createLogger('mis-programs');

/**
 * Программы вызывающего держим в памяти: список специальностей запрашивается на каждом
 * шаге записи, а флаг медсчёта у программы не меняется. Новая программа появится здесь
 * не позже чем через TTL. Сбой запроса не кешируется — это не ответ.
 */
const PROGRAMS_CACHE_TTL_MS = 10 * 60 * 1000;
const PROGRAMS_CACHE_SWEEP_SIZE = 1000;

/** id программы → `isMedAccount`. */
type MedAccountFlags = Map<string, boolean>;

const programsCache = new Map<string, { flags: MedAccountFlags; expiresAt: number }>();

const rememberPrograms = (userId: string, flags: MedAccountFlags) => {
  const now = Date.now();

  if (programsCache.size >= PROGRAMS_CACHE_SWEEP_SIZE) {
    for (const [cachedUserId, entry] of programsCache) {
      if (entry.expiresAt <= now) programsCache.delete(cachedUserId);
    }
  }

  programsCache.set(userId, { flags, expiresAt: now + PROGRAMS_CACHE_TTL_MS });
};

const readMedAccountFlags = async (user: {
  id: string;
  phone: string;
}): Promise<MedAccountFlags | undefined> => {
  const cached = programsCache.get(user.id);

  if (cached && cached.expiresAt > Date.now()) return cached.flags;

  const beneficiaryId = await getBeneficiaryId(user.id, user.phone);

  if (!beneficiaryId) return undefined;

  try {
    const programs = await insuranceService.getPrograms(beneficiaryId);
    const flags: MedAccountFlags = new Map(
      (programs || []).map((program) => [String(program.id), program.isMedAccount === true])
    );

    rememberPrograms(user.id, flags);

    return flags;
  } catch (error) {
    programsLogger.warn({ err: error, userId: user.id }, 'Could not read insurance programs');
    return undefined;
  }
};

/**
 * Записываемся ли по страховому покрытию: `programId` передан и это не программа медсчёта.
 *
 * Без `programId` — платная запись. Программа с `isMedAccount` — медсчёт. Всё остальное,
 * включая программу, которую не удалось проверить (страховая недоступна, программа не
 * вызывающего), считается страховой: от этого зависит только то, какие специальности
 * скрыть, и показать лишнюю застрахованному хуже, чем на время сбоя скрыть её у медсчёта.
 */
export const isInsuranceCoverBooking = async (
  user: { id: string; phone: string },
  programId: string | undefined
): Promise<boolean> => {
  if (!programId) return false;

  const flags = await readMedAccountFlags(user);

  return flags?.get(programId) !== true;
};
