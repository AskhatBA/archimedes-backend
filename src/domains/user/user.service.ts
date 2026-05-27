import * as db from '@/infrastructure/db';

import * as misService from '../mis/mis.service';
import * as insuranceService from '../insurance/insurance.service';

export const checkAccount = async (iin: string, phone?: string) => {
  const [dbUser, misPatient, insuranceResult] = await Promise.all([
    findInDb(iin, phone),
    safeCheckMis(iin),
    safeCheckInsurance(iin),
  ]);

  const isPhoneMatch = phone && phone === insuranceResult?.phone;

  return {
    existsInDb: !!dbUser,
    existsInMis: !!misPatient,
    existsInInsurance: insuranceResult?.errorCode === 0 && !!insuranceResult?.phone,
    isPhoneMatch,
  };
};

const findInDb = async (iin: string, phone?: string) => {
  const patient = await db.prismaClient.patient.findUnique({ where: { iin } });
  if (patient) return patient;

  if (phone) {
    return db.prismaClient.user.findUnique({ where: { phone } });
  }

  return null;
};

const safeCheckMis = async (iin: string) => {
  try {
    return await misService.findPatientByIinAndPhone(iin);
  } catch {
    return undefined;
  }
};

const safeCheckInsurance = async (iin: string) => {
  try {
    return await insuranceService.checkIin(iin);
  } catch {
    return undefined;
  }
};
