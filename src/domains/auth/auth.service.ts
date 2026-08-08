import { AuditEvent } from '@prisma/client';

import * as db from '@/infrastructure/db';

import { User, Role } from './auth.types';
import { CreateUserDto, CreatePatientAccountDto } from './auth.dto';

// Events that mark the start of a new session (a fresh login), as opposed to
// token refreshes that merely continue an existing session. Biometric unlock
// goes through /refresh, so it is intentionally excluded from login history.
const LOGIN_EVENTS: AuditEvent[] = [
  AuditEvent.AUTH_LOGIN_SUCCESS,
  AuditEvent.AUTH_PIN_VERIFY_SUCCESS,
];

const LOGIN_METHOD_BY_EVENT: Partial<Record<AuditEvent, 'OTP' | 'PIN'>> = {
  [AuditEvent.AUTH_LOGIN_SUCCESS]: 'OTP',
  [AuditEvent.AUTH_PIN_VERIFY_SUCCESS]: 'PIN',
};

export interface LoginHistoryEntry {
  id: string;
  method: 'OTP' | 'PIN';
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

/**
 * Read-only login history for a user, derived from the audit log. Returns
 * session-starting events (OTP / PIN logins) most recent first.
 */
export const getLoginHistory = async (
  userId: string,
  limit = 50,
  offset = 0,
): Promise<LoginHistoryEntry[]> => {
  const logs = await db.prismaClient.auditLog.findMany({
    where: {
      userId,
      success: true,
      event: { in: LOGIN_EVENTS },
    },
    select: {
      id: true,
      event: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });

  return logs.map((log) => ({
    id: log.id,
    method: LOGIN_METHOD_BY_EVENT[log.event] ?? 'OTP',
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    createdAt: log.createdAt,
  }));
};

export const findUserById = async (userId: string): Promise<User | null> => {
  return db.prismaClient.user.findUnique({
    where: { id: userId },
  });
};

export const findUserByPhone = async (phone: string): Promise<User | null> => {
  return db.prismaClient.user.findUnique({
    where: { phone: phone },
  });
};

export const createUser = async (user: CreateUserDto) => {
  return db.prismaClient.user.create({
    data: {
      phone: user.phone,
      email: user.email || null,
      role: Role.PATIENT,
    },
  });
};

/**
 * Resolves the account a login attempt refers to. The IIN is authoritative
 * (it lives on the patient profile); the phone is the fallback for accounts
 * created before registration became a separate flow, which have a user row but
 * no patient profile yet.
 */
export const findAccountByIinOrPhone = async (
  iin: string,
  phone: string
): Promise<User | null> => {
  const patient = await db.prismaClient.patient.findUnique({ where: { iin } });

  if (patient) {
    return findUserById(patient.userId);
  }

  return findUserByPhone(phone);
};

export const accountExists = async (iin: string, phone: string): Promise<boolean> => {
  return !!(await findAccountByIinOrPhone(iin, phone));
};

/**
 * Creates the user row and its patient profile together, so a registration that
 * fails part-way never leaves a phone number claimed by a profile-less account.
 */
export const createPatientAccount = async (input: CreatePatientAccountDto) => {
  return db.prismaClient.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        phone: input.phone,
        role: Role.PATIENT,
      },
    });

    const patient = await tx.patient.create({
      data: {
        userId: user.id,
        firstName: input.firstName,
        lastName: input.lastName,
        patronymic: input.patronymic || '',
        fullName: `${input.firstName} ${input.lastName}`,
        birthDate: input.birthDate,
        gender: input.gender,
        iin: input.iin,
        misPatientId: input.misPatientId,
      },
    });

    return { user, patient };
  });
};

export const updateUserPhone = async (userId: string, phone: string) => {
  return db.prismaClient.user.update({
    where: { id: userId },
    data: { phone },
  });
};

export const clearRefreshToken = async (userId: string): Promise<void> => {
  await db.prismaClient.user.update({
    where: { id: userId },
    data: { refreshTokenHash: null },
  });
};

export const incrementTokenVersion = async (userId: string) => {
  return db.prismaClient.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
};

export const setPin = async (userId: string, pinHash: string) => {
  return db.prismaClient.user.update({
    where: { id: userId },
    data: { pinHash, pinFailedAttempts: 0, pinLockedUntil: null },
  });
};

export const registerPinFailure = async (
  userId: string,
  attempts: number,
  lockedUntil: Date | null,
) => {
  return db.prismaClient.user.update({
    where: { id: userId },
    data: { pinFailedAttempts: attempts, pinLockedUntil: lockedUntil },
  });
};

export const resetPinAttempts = async (userId: string) => {
  return db.prismaClient.user.update({
    where: { id: userId },
    data: { pinFailedAttempts: 0, pinLockedUntil: null },
  });
};

export const setBiometricEnabled = async (userId: string, enabled: boolean) => {
  return db.prismaClient.user.update({
    where: { id: userId },
    data: { biometricEnabled: enabled },
  });
};
