import { Request, Response } from 'express';
import { isProduction, config } from '@/config';
import { ErrorCodes } from '@/shared/constants/error-codes';
import { AppError } from '@/shared/services/app-error.service';
import * as otpService from '@/shared/services/otp.service';
import * as pinService from '@/shared/services/pin.service';
import * as jwtService from '@/shared/services/jwt.service';
import * as auditLogService from '@/shared/services/audit-log.service';
import { AuditEvent } from '@/shared/services/audit-log.service';
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
          auditLogService.log({
            event: AuditEvent.USER_PHONE_CHANGED,
            success: true,
            userId: patient.userId,
            phone,
            req,
            metadata: { source: 'insurance_sync', previousPhone: existingUser.phone },
          });
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

  auditLogService.log({
    event: AuditEvent.USER_ACCOUNT_CREATED,
    success: true,
    userId: createdUser.id,
    phone,
    req,
  });

  return res
    .status(200)
    .json({ id: createdUser?.id, phone: phone, otp: isProduction ? undefined : otp });
};

export const verifyOtp = async (req: Request, res: Response) => {
  const { phone, otp } = req.body;

  if (!otp) {
    const user = await authService.findUserByPhone(phone).catch(() => null);
    await auditLogService.log({
      event: AuditEvent.AUTH_LOGIN_FAILED,
      success: false,
      ...(user?.id !== undefined && { userId: user.id }),
      phone,
      req,
      metadata: { reason: 'OTP_NOT_PROVIDED' },
    });
    throw new AppError(ErrorCodes.INVALID_OTP, 400);
  }

  try {
    await otpService.validateOTP(phone, otp);
  } catch (err) {
    const user = await authService.findUserByPhone(phone).catch(() => null);
    await auditLogService.log({
      event: AuditEvent.AUTH_LOGIN_FAILED,
      success: false,
      ...(user?.id !== undefined && { userId: user.id }),
      phone,
      req,
      metadata: { reason: err instanceof AppError ? err.message : 'OTP validation failed' },
    });
    throw err;
  }

  const user = await authService.findUserByPhone(phone);

  if (!user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 404);
  }

  const updatedUser = await authService.incrementTokenVersion(user.id);
  const tokens = jwtService.generateTokenPair({ userId: user.id, role: user.role, tokenVersion: updatedUser.tokenVersion });
  await jwtService.saveRefreshToken(user.id, tokens.refreshToken);

  await auditLogService.log({
    event: AuditEvent.AUTH_LOGIN_SUCCESS,
    success: true,
    userId: user.id,
    phone,
    req,
  });

  return res.status(200).json({
    success: true,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
};

export const logout = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  // Clear the refresh token and bump tokenVersion so the outstanding access
  // token is rejected immediately instead of lingering until it expires.
  await authService.clearRefreshToken(req.user.id);
  await authService.incrementTokenVersion(req.user.id);

  await auditLogService.log({
    event: AuditEvent.AUTH_LOGOUT,
    success: true,
    userId: req.user.id,
    phone: req.user.phone,
    req,
  });

  return res.status(200).json({ success: true });
};

/**
 * Exchange a valid refresh token for a fresh 15-minute access token.
 * Called by the app after biometric unlock releases the stored refresh token
 * from secure device storage (Variant B). Rotates the refresh token on every
 * use and does NOT bump tokenVersion — this is a continuation of the same
 * session, not a new login.
 */
export const refresh = async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (!refreshToken || typeof refreshToken !== 'string') {
    throw new AppError(ErrorCodes.INVALID_REFRESH_TOKEN, 401);
  }

  const decoded = jwtService.verifyRefreshToken(refreshToken);
  const user = await authService.findUserById(decoded.userId);

  if (!user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  if (decoded.tokenVersion !== user.tokenVersion) {
    await auditLogService.log({
      event: AuditEvent.AUTH_REFRESH_FAILED,
      success: false,
      userId: user.id,
      phone: user.phone,
      req,
      metadata: { reason: 'SESSION_REPLACED' },
    });
    throw new AppError(ErrorCodes.SESSION_REPLACED, 401);
  }

  if (!jwtService.compareTokenHash(refreshToken, user.refreshTokenHash)) {
    await auditLogService.log({
      event: AuditEvent.AUTH_REFRESH_FAILED,
      success: false,
      userId: user.id,
      phone: user.phone,
      req,
      metadata: { reason: 'REFRESH_TOKEN_REVOKED' },
    });
    throw new AppError(ErrorCodes.REFRESH_TOKEN_REVOKED, 401);
  }

  const tokens = jwtService.generateTokenPair({
    userId: user.id,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });
  await jwtService.saveRefreshToken(user.id, tokens.refreshToken);

  await auditLogService.log({
    event: AuditEvent.AUTH_TOKEN_REFRESHED,
    success: true,
    userId: user.id,
    phone: user.phone,
    req,
  });

  return res.status(200).json({
    success: true,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
};

export const setPin = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const { pin } = req.body;
  pinService.assertValidPinFormat(pin);

  const pinHash = await pinService.hashPin(pin);
  await authService.setPin(req.user.id, pinHash);

  await auditLogService.log({
    event: AuditEvent.USER_PIN_SET,
    success: true,
    userId: req.user.id,
    phone: req.user.phone,
    req,
  });

  return res.status(200).json({ success: true });
};

/**
 * PIN fallback path used when biometrics are unavailable/declined. Identifies
 * the user by phone, enforces a lockout after too many failed attempts, and on
 * success issues a fresh 15-minute session (same tokenVersion).
 */
export const verifyPin = async (req: Request, res: Response) => {
  const { phone, pin } = req.body;
  const user = phone ? await authService.findUserByPhone(phone) : null;

  if (!user || !user.pinHash) {
    await auditLogService.log({
      event: AuditEvent.AUTH_PIN_VERIFY_FAILED,
      success: false,
      ...(user?.id !== undefined && { userId: user.id }),
      phone,
      req,
      metadata: { reason: user ? 'PIN_NOT_SET' : 'USER_NOT_FOUND' },
    });
    throw new AppError(user ? ErrorCodes.PIN_NOT_SET : ErrorCodes.INVALID_PIN, 400);
  }

  if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
    await auditLogService.log({
      event: AuditEvent.AUTH_PIN_LOCKED,
      success: false,
      userId: user.id,
      phone: user.phone,
      req,
      metadata: { lockedUntil: user.pinLockedUntil.toISOString() },
    });
    throw new AppError(ErrorCodes.PIN_LOCKED, 429);
  }

  const isValid = typeof pin === 'string' && (await pinService.verifyPin(pin, user.pinHash));

  if (!isValid) {
    const attempts = user.pinFailedAttempts + 1;
    const shouldLock = attempts >= config.pin.maxAttempts;
    const lockedUntil = shouldLock
      ? new Date(Date.now() + config.pin.lockMinutes * 60 * 1000)
      : null;

    // Reset the counter when locking so the window restarts after it expires.
    await authService.registerPinFailure(user.id, shouldLock ? 0 : attempts, lockedUntil);

    await auditLogService.log({
      event: shouldLock ? AuditEvent.AUTH_PIN_LOCKED : AuditEvent.AUTH_PIN_VERIFY_FAILED,
      success: false,
      userId: user.id,
      phone: user.phone,
      req,
      metadata: { attempts, ...(lockedUntil && { lockedUntil: lockedUntil.toISOString() }) },
    });

    throw new AppError(shouldLock ? ErrorCodes.PIN_LOCKED : ErrorCodes.INVALID_PIN, shouldLock ? 429 : 400);
  }

  await authService.resetPinAttempts(user.id);

  const tokens = jwtService.generateTokenPair({
    userId: user.id,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });
  await jwtService.saveRefreshToken(user.id, tokens.refreshToken);

  await auditLogService.log({
    event: AuditEvent.AUTH_PIN_VERIFY_SUCCESS,
    success: true,
    userId: user.id,
    phone: user.phone,
    req,
  });

  return res.status(200).json({
    success: true,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
};

export const setBiometric = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const enabled = req.body?.enabled === true;
  await authService.setBiometricEnabled(req.user.id, enabled);

  await auditLogService.log({
    event: enabled ? AuditEvent.USER_BIOMETRIC_ENABLED : AuditEvent.USER_BIOMETRIC_DISABLED,
    success: true,
    userId: req.user.id,
    phone: req.user.phone,
    req,
  });

  return res.status(200).json({ success: true, biometricEnabled: enabled });
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

  auditLogService.log({
    event: AuditEvent.USER_PHONE_CHANGED,
    success: true,
    userId: req.user.id,
    phone,
    req,
    metadata: { previousPhone: req.user.phone, newPhone: phone },
  });

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
