import crypto from 'crypto';

import bcrypt from 'bcryptjs';

import { AppError } from '@/shared/services/app-error.service';
import { ErrorCodes } from '@/shared/constants/error-codes';

import { prismaClient } from '../../infrastructure/db';

export const generateOTPCode = (): string => {
  return crypto.randomInt(1000, 9999).toString();
};

export const hashOTP = (otp: string) => {
  return bcrypt.hash(otp, 10);
};

export const saveOTP = async (userId: string, code: string): Promise<void> => {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
  const otp = await prismaClient.oTP.findFirst({ where: { userId, used: false } });

  if (!otp) {
    await prismaClient.oTP.create({
      data: {
        userId,
        code,
        expiresAt,
      },
    });
  } else {
    await prismaClient.oTP.update({
      where: { userId },
      data: {
        code,
        expiresAt,
      },
    });
  }
};

export const validateOTP = async (phone: string, code: string): Promise<boolean> => {
  const user = await prismaClient.user.findFirst({ where: { phone } });

  if (!user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 404);
  }

  const otp = await prismaClient.oTP.findFirst({
    where: {
      userId: user.id,
      used: false,
    },
  });

  if (!otp) {
    throw new AppError(ErrorCodes.INVALID_OTP, 400);
  }

  const isValidOTP = await bcrypt.compare(code, otp.code);

  if (!isValidOTP) {
    throw new AppError(ErrorCodes.INVALID_OTP, 400);
  }

  if (otp.expiresAt < new Date()) {
    throw new AppError(ErrorCodes.OTP_EXPIRED, 400);
  }

  return true;
};

export const deleteExpiredOTPs = async (): Promise<void> => {
  await prismaClient.oTP.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date() } }, { used: true }],
    },
  });
};
