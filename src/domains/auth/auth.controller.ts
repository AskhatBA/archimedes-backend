import { Request, Response } from 'express';
import { Role } from '@prisma/client';

import { isProduction, config } from '@/config';
import { ErrorCodes } from '@/shared/constants/error-codes';
import { AppError } from '@/shared/services/app-error.service';
import * as otpService from '@/shared/services/otp.service';
import * as jwtService from '@/shared/services/jwt.service';
import * as smsService from '@/infrastructure/sms/sms.service';
import * as insuranceService from '@/domains/insurance/insurance.service';
import * as patientService from '@/domains/patient/patient.service';

import * as authService from './auth.service';

export const requestOtp = async (req: Request, res: Response) => {
  const { email, iin } = req.body;
  let { phone } = req.body;
  const phoneRegex = /^7\d{10}$/;

  if (iin) {
    const checkIin = await insuranceService.checkIin(iin);
    const patient = await patientService.getPatientByIin(iin);

    if (checkIin.errorCode === 0 && checkIin.phone) {
      if (checkIin.phone !== phone) {
        throw new AppError(ErrorCodes.INSURANCE_PHONE_IS_NOT_MATCHED, 400);
      }

      phone = checkIin.phone;

      if (patient) {
        const existingUser = await authService.findUserById(patient.userId);
        if (existingUser && existingUser.phone !== phone) {
          await authService.updateUserPhone(patient.userId, phone);
        }
      }
    } else if (patient) {
      const existingUser = await authService.findUserById(patient.userId);
      if (existingUser?.phone !== phone) {
        throw new AppError(ErrorCodes.INSURANCE_PHONE_IS_NOT_MATCHED, 400);
      }
    }
  }

  if (!phone || !phoneRegex.test(phone)) {
    throw new AppError(ErrorCodes.INVALID_PHONE, 400);
  }

  const otp = otpService.generateOTPCode();
  const hashedOTP = await otpService.hashOTP(otp);
  const user = await authService.findUserByPhone(phone);
  const isUserExists = !!user?.id;

  if (isProduction) {
    await smsService.sendSMS(phone, `Код для авторизации: ${otp}`);
  }

  if (isUserExists) {
    await otpService.saveOTP(user.id, hashedOTP);
    return res
      .status(200)
      .json({ id: user?.id, phone: phone, otp: isProduction ? undefined : otp });
  }

  const createdUser = await authService.createUser({
    email: email,
    phone: phone,
  });

  await otpService.saveOTP(createdUser.id, hashedOTP);

  return res
    .status(200)
    .json({ id: createdUser?.id, phone: phone, otp: isProduction ? undefined : otp });
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

export const changePhone = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const { phone } = req.body;
  const phoneRegex = /^7\d{10}$/;

  if (!phone || !phoneRegex.test(phone)) {
    throw new AppError(ErrorCodes.INVALID_PHONE, 400);
  }

  const existingUser = await authService.findUserByPhone(phone);
  if (existingUser && existingUser.id !== req.user.id) {
    throw new AppError(ErrorCodes.INVALID_PHONE, 400);
  }

  const updated = await authService.updateUserPhone(req.user.id, phone);

  return res.status(200).json({
    success: true,
    user: { id: updated.id, phone: updated.phone, role: updated.role },
  });
};

export const createDemoAccount = async (_: Request, res: Response) => {
  const { demoAccount } = config;

  const createdUser = await authService.createUser({
    phone: demoAccount.phone || '',
  });

  return res.status(200).json({
    id: createdUser?.id,
    phone: demoAccount.phone,
    otp: demoAccount.otp,
  });
};
