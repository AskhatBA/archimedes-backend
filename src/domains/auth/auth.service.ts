import { AuditEvent } from '@prisma/client';

import * as db from '@/infrastructure/db';

import { User, Role } from './auth.types';
import { CreateUserDto } from './auth.dto';

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
