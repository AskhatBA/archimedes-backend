import { prismaClient } from '@/infrastructure/db';
import { useDemoAccount } from '@/shared/helpers';
import { createLogger } from '@/shared/lib/logger';

import { checkIin } from './insurance.service';

const beneficiaryLogger = createLogger('insurance-beneficiary');

/**
 * Незастрахованного пользователя страховая не знает, и пока `benId` у него нет, каждый
 * запрос к `/insurance/*` ходил бы в `/v3/checkPhone` — а приложение опрашивает часть
 * экранов раз в 40 секунд. Поэтому отказ страховой помним в памяти процесса; новый полис
 * подхватится не позже чем через TTL. Сбой запроса не кешируется — это не ответ.
 */
const UNKNOWN_TTL_MS = 10 * 60 * 1000;
const UNKNOWN_SWEEP_SIZE = 1000;

const unknownUntil = new Map<string, number>();

const rememberUnknown = (userId: string) => {
  const now = Date.now();

  if (unknownUntil.size >= UNKNOWN_SWEEP_SIZE) {
    for (const [cachedUserId, expiresAt] of unknownUntil) {
      if (expiresAt <= now) unknownUntil.delete(cachedUserId);
    }
  }

  unknownUntil.set(userId, now + UNKNOWN_TTL_MS);
};

const isKnownUnknown = (userId: string) => (unknownUntil.get(userId) ?? 0) > Date.now();

const saveBeneficiaryId = async (userId: string, beneficiaryId: string) => {
  try {
    await prismaClient.patient.update({ where: { userId }, data: { beneficiaryId } });
  } catch (error) {
    beneficiaryLogger.warn({ err: error, userId }, 'Could not store beneficiaryId on patient');
  }
};

/**
 * `benId` пациента у страховой.
 *
 * Берётся из профиля (`Patient.beneficiaryId`). Если там пусто — спрашиваем
 * `/v3/checkPhone` по ИИН профиля, отдаём полученный `benId` сразу и, не дожидаясь,
 * записываем его в профиль.
 *
 * - строка — `benId`;
 * - `null` — страховая этого пациента не знает (нет страховки);
 * - `undefined` — спросить не удалось: нет профиля или страховая недоступна.
 *
 * Никогда не бросает.
 */
export const getBeneficiaryId = async (
  userId: string,
  phone: string
): Promise<string | null | undefined> => {
  const patient = await prismaClient.patient
    .findUnique({ where: { userId }, select: { iin: true, beneficiaryId: true } })
    .catch((error: unknown) => {
      beneficiaryLogger.warn({ err: error, userId }, 'Could not read patient for beneficiaryId');
      return undefined;
    });

  if (!patient) return undefined;
  if (patient.beneficiaryId) return patient.beneficiaryId;
  if (isKnownUnknown(userId)) return null;

  const { isDemoAccount, misIin } = useDemoAccount();
  const iin = isDemoAccount(phone, patient.iin) ? misIin : patient.iin;

  let benId: string | undefined;

  try {
    const response = await checkIin(iin);
    benId = response?.errorCode === 0 && response.benId ? response.benId : undefined;
  } catch (error) {
    beneficiaryLogger.warn({ err: error, userId }, 'Could not resolve beneficiaryId from insurer');
    return undefined;
  }

  if (!benId) {
    rememberUnknown(userId);
    return null;
  }

  unknownUntil.delete(userId);
  void saveBeneficiaryId(userId, benId);

  return benId;
};

/**
 * Дозаполняет `benId` в профиле при входе. Уже записанный не трогает. Ничего не
 * возвращает и не бросает — вход не должен зависеть от страховой.
 */
export const ensureBeneficiaryId = (userId: string, phone: string): void => {
  void getBeneficiaryId(userId, phone);
};

/** Забыть отказ страховой — после смены ИИН он относится к другому человеку. */
export const forgetBeneficiaryLookup = (userId: string) => {
  unknownUntil.delete(userId);
};
