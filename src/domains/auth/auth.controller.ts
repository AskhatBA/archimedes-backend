import { Request, Response } from 'express';
import { Role } from '@prisma/client';

import { ErrorCodes } from '@/shared/constants/error-codes';
import { AppError } from '@/shared/services/app-error.service';
import * as otpService from '@/shared/services/otp.service';
import * as jwtService from '@/shared/services/jwt.service';

import * as authService from './auth.service';

export const requestOtp = async (req: Request, res: Response) => {
  const { phone, email } = req.body;
  const otp = otpService.generateOTPCode();
  const hashedOTP = await otpService.hashOTP(otp);
  const user = await authService.findUserByPhone(phone);
  const isUserExists = !!user?.id;
  const phoneRegex = /^7\d{10}$/;

  if (!phone || !phoneRegex.test(phone)) {
    throw new AppError(ErrorCodes.INVALID_PHONE, 400);
  }

  if (isUserExists) {
    await otpService.saveOTP(user.id, hashedOTP);
    return res.status(200).json({ id: user?.id, phone: phone, otp: otp });
  }

  const createdUser = await authService.createUser({
    email: email,
    phone: phone,
  });

  await otpService.saveOTP(createdUser.id, hashedOTP);

  return res.status(200).json({ id: createdUser?.id, phone: phone, otp: otp });
};

export const verifyOtp = async (req: Request, res: Response) => {
  const { phone, otp } = req.body;

  await otpService.validateOTP(phone, otp);
  const user = await authService.findUserByPhone(phone);

  if (!user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 404);
  }

  const tokens = jwtService.generateTokenPair({ userId: user.id, role: Role.PATIENT });
  await jwtService.saveRefreshToken(user.id, tokens.refreshToken);

  return res.status(200).json({
    success: true,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
};
