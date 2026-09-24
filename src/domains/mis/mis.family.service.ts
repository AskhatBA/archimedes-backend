import * as insuranceService from '@/domains/insurance/insurance.service';
import { getPatientById } from '@/domains/patient/patient.service';
import { ErrorCodes } from '@/shared/constants/error-codes';
import { AppError } from '@/shared/services/app-error.service';

import { getUserInsuranceDetails } from './mis.service';

/**
 * Чьи приёмы читать из МИС: владельца аккаунта или члена его семьи.
 *
 * Записаться можно и на родственника по программе (`familyMemberId` при бронировании), но
 * списки приёмов, заявок и детали приёма МИС отдаёт по id пациента в пути, и раньше туда
 * всегда шёл `misPatientId` владельца — записи родственника в приложении не было видно.
 * МИС принимает в пути и `benId` родственника из страховой — тот же id, с которым приём
 * был создан и по которому сверка статусов читает его строку.
 *
 * Отдавать МИС произвольный id с клиента нельзя: это чужие медицинские записи. Поэтому
 * `familyMemberId` принимается только вместе с `programId` и только если страховая
 * подтверждает, что программа — вызывающего, а человек — в её семейном списке.
 */

export interface FamilyMemberQuery {
  familyMemberId?: string | undefined;
  programId?: string | undefined;
}

/**
 * Состав семьи держим в памяти: список приёмов опрашивается раз в 40 секунд, а каждая
 * проверка — это три запроса во внешние системы (МИС за beneficiaryId, программы и семья
 * у страховой). Новый родственник в полисе появится здесь не позже чем через TTL.
 */
const FAMILY_CACHE_TTL_MS = 10 * 60 * 1000;
const FAMILY_CACHE_SWEEP_SIZE = 1000;

const familyCache = new Map<string, { benIds: Set<string>; expiresAt: number }>();

const rememberFamily = (key: string, benIds: Set<string>) => {
  const now = Date.now();

  if (familyCache.size >= FAMILY_CACHE_SWEEP_SIZE) {
    for (const [cachedKey, entry] of familyCache) {
      if (entry.expiresAt <= now) familyCache.delete(cachedKey);
    }
  }

  familyCache.set(key, { benIds, expiresAt: now + FAMILY_CACHE_TTL_MS });
};

/**
 * `benId` семьи по программе вызывающего. Пустой набор — если программа не его: страховая
 * отдаёт семью по любому `programId`, так что принадлежность проверяем сами.
 */
const readFamilyBenIds = async (
  user: { id: string; phone: string },
  programId: string
): Promise<Set<string>> => {
  const key = `${user.id}:${programId}`;
  const cached = familyCache.get(key);

  if (cached && cached.expiresAt > Date.now()) return cached.benIds;

  const insurance = await getUserInsuranceDetails(user.id, user.phone);

  if (!insurance?.beneficiaryId) {
    throw new AppError(ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS, 404);
  }

  const programs = await insuranceService.getPrograms(insurance.beneficiaryId);
  const ownsProgram = (programs || []).some((program) => String(program.id) === programId);

  const family = ownsProgram
    ? await insuranceService.getFamily(insurance.beneficiaryId, programId)
    : [];

  const benIds = new Set(
    (family || []).filter((member) => member?.benId).map((member) => String(member.benId))
  );

  rememberFamily(key, benIds);

  return benIds;
};

/**
 * Id пациента, которым спрашивать МИС о приёмах.
 *
 * Без `familyMemberId` — сам владелец аккаунта, как было всегда. С ним — `benId`
 * родственника, если он есть в семье по программе вызывающего; иначе 403, не раскрывая,
 * чего именно не хватило.
 */
export const resolveAppointmentsPatientId = async (
  user: { id: string; phone: string },
  { familyMemberId, programId }: FamilyMemberQuery = {}
): Promise<string> => {
  if (!familyMemberId) {
    const patient = await getPatientById(user.id);

    if (!patient?.misPatientId) {
      throw new AppError('Patient not found', 400);
    }

    return patient.misPatientId;
  }

  if (!programId) {
    throw new AppError('programId is required with familyMemberId', 400);
  }

  const benIds = await readFamilyBenIds(user, programId);

  if (!benIds.has(familyMemberId)) {
    throw new AppError(ErrorCodes.INSURANCE_FAMILY_MEMBER_NOT_FOUND, 403);
  }

  return familyMemberId;
};
