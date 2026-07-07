import * as db from '@/infrastructure/db';

import { User, Role } from './auth.types';
import { CreateUserDto } from './auth.dto';

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
