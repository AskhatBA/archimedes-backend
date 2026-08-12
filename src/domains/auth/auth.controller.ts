import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';

import { isProduction, config } from '@/config';
import { ErrorCodes } from '@/shared/constants/error-codes';
import { AppError } from '@/shared/services/app-error.service';
import * as otpService from '@/shared/services/otp.service';
import * as registrationOtpService from '@/shared/services/registration-otp.service';
import * as pinService from '@/shared/services/pin.service';
import * as jwtService from '@/shared/services/jwt.service';
import * as auditLogService from '@/shared/services/audit-log.service';
import { AuditEvent } from '@/shared/services/audit-log.service';
import * as smsService from '@/infrastructure/sms/sms.service';
import * as insuranceService from '@/domains/insurance/insurance.service';
import * as patientService from '@/domains/patient/patient.service';
import * as misService from '@/domains/mis/mis.service';

import * as authService from './auth.service';

const PHONE_REGEX = /^7\d{10}$/;

const assertValidPhone = (phone: unknown): string => {
  if (typeof phone !== 'string' || !PHONE_REGEX.test(phone)) {
    throw new AppError(ErrorCodes.INVALID_PHONE, 400);
  }

  return phone;
};

/**
 * Login only. Unlike before, this never provisions an account — a phone/IIN with
 * no account in our DB is sent to the registration flow instead.
 */
export const requestOtp = async (req: Request, res: Response) => {
  let { phone } = req.body;
  const iin: string | undefined = req.body.iin;

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

  assertValidPhone(phone);

  const user = iin
    ? await authService.findAccountByIinOrPhone(iin, phone)
    : await authService.findUserByPhone(phone);

  if (!user) {
    await auditLogService.log({
      event: AuditEvent.AUTH_LOGIN_FAILED,
      success: false,
      phone,
      req,
      metadata: { reason: 'ACCOUNT_NOT_FOUND' },
    });
    throw new AppError(ErrorCodes.ACCOUNT_NOT_FOUND, 404);
  }

  const otp = otpService.generateOTPCode();
  const hashedOTP = await otpService.hashOTP(otp);

  if (isProduction) {
    await smsService.sendSMS(phone, `Код для авторизации: ${otp}`);
  }

  await otpService.saveOTP(user.id, hashedOTP);

  auditLogService.log({
    event: AuditEvent.AUTH_OTP_REQUEST,
    success: true,
    userId: user.id,
    phone,
    req,
  });

  return res.status(200).json({ id: user.id, phone: phone, otp: isProduction ? undefined : otp });
};

/**
 * Registration, step 1: claim a phone/IIN pair and send a confirmation code.
 * Rejects identities that already have an account — those belong in the login
 * flow — and identities whose insurance record is registered to another number.
 */
export const registerStart = async (req: Request, res: Response) => {
  const phone = assertValidPhone(req.body.phone);
  const iin = req.body.iin as string;

  if (await authService.accountExists(iin, phone)) {
    throw new AppError(ErrorCodes.ACCOUNT_ALREADY_EXISTS, 409);
  }

  // When the insurance service knows this IIN its phone is authoritative:
  // registering under a different number would build an account the insured
  // person can never reach.
  const checkIin = await insuranceService.checkIin(iin).catch(() => undefined);

  if (checkIin?.errorCode === 0 && checkIin.phone && checkIin.phone !== phone) {
    throw new AppError(ErrorCodes.INSURANCE_PHONE_IS_NOT_MATCHED, 400);
  }

  const otp = otpService.generateOTPCode();
  const hashedOtp = await otpService.hashOTP(otp);

  await registrationOtpService.saveRegistrationOtp(phone, iin, hashedOtp);

  if (isProduction) {
    await smsService.sendSMS(phone, `Код для регистрации: ${otp}`);
  }

  auditLogService.log({
    event: AuditEvent.AUTH_OTP_REQUEST,
    success: true,
    phone,
    req,
    metadata: { flow: 'registration' },
  });

  return res.status(200).json({
    success: true,
    phone,
    otp: isProduction ? undefined : otp,
  });
};

/**
 * Registration, step 2: exchange the code for a short-lived registration token
 * and, in the same response, whatever MIS already knows about this patient so
 * the form can be pre-filled. The MIS lookup sits behind OTP verification on
 * purpose — it returns a real person's name and birth date, which must not be
 * readable by anyone who merely knows an IIN.
 */
export const registerVerifyOtp = async (req: Request, res: Response) => {
  const phone = assertValidPhone(req.body.phone);
  const iin = req.body.iin as string;
  const { otp } = req.body;

  try {
    await registrationOtpService.validateRegistrationOtp(phone, iin, otp);
  } catch (err) {
    await auditLogService.log({
      event: AuditEvent.AUTH_LOGIN_FAILED,
      success: false,
      phone,
      req,
      metadata: {
        flow: 'registration',
        reason: err instanceof AppError ? err.message : 'OTP validation failed',
      },
    });
    throw err;
  }

  // The account could have been created while the code was in flight.
  if (await authService.accountExists(iin, phone)) {
    throw new AppError(ErrorCodes.ACCOUNT_ALREADY_EXISTS, 409);
  }

  const misPatient = await misService.findPatientByIinAndPhone(iin).catch(() => undefined);

  const registrationToken = jwtService.generateRegistrationToken({
    phone,
    iin,
    ...(misPatient?.id && { misPatientId: misPatient.id }),
  });

  return res.status(200).json({
    success: true,
    registrationToken,
    existsInMis: !!misPatient,
    patient: misPatient
      ? {
          firstName: misPatient.firstName,
          lastName: misPatient.lastName,
          patronymic: misPatient.patronymic,
          birthDate: misPatient.birthDate,
          gender: misPatient.gender,
          iin: misPatient.iin,
        }
      : undefined,
  });
};

/**
 * Registration, step 3: create the MIS patient (when missing), the user and the
 * patient profile, then sign the user in. The phone/IIN come from the
 * registration token, never from the request body.
 */
export const registerComplete = async (req: Request, res: Response) => {
  const { registrationToken, firstName, lastName, patronymic, birthDate, gender } = req.body;

  if (!registrationToken || typeof registrationToken !== 'string') {
    throw new AppError(ErrorCodes.INVALID_REGISTRATION_TOKEN, 401);
  }

  await body('firstName').notEmpty().withMessage('First name is required').run(req);
  await body('lastName').notEmpty().withMessage('Last name is required').run(req);
  await body('birthDate').notEmpty().withMessage('Valid birth date is required').run(req);
  await body('gender').notEmpty().isIn(['M', 'F']).withMessage('Gender must be M or F').run(req);

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { phone, iin, misPatientId } = jwtService.verifyRegistrationToken(registrationToken);

  if (await authService.accountExists(iin, phone)) {
    throw new AppError(ErrorCodes.ACCOUNT_ALREADY_EXISTS, 409);
  }

  let resolvedMisPatientId = misPatientId;

  if (!resolvedMisPatientId) {
    const createdMisPatient = await misService.createPatient({
      phoneNumber: phone,
      firstName,
      lastName,
      patronymic,
      gender,
      birthDate,
      iin,
    });

    resolvedMisPatientId = createdMisPatient?.id;
  }

  if (!resolvedMisPatientId) {
    throw new AppError(ErrorCodes.MIS_PATIENT_NOT_FOUND, 400);
  }

  const { user } = await authService.createPatientAccount({
    phone,
    iin,
    firstName,
    lastName,
    patronymic,
    birthDate,
    gender,
    misPatientId: resolvedMisPatientId,
  });

  const tokens = jwtService.generateTokenPair({
    userId: user.id,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });
  await jwtService.saveRefreshToken(user.id, tokens.refreshToken);

  auditLogService.log({
    event: AuditEvent.USER_ACCOUNT_CREATED,
    success: true,
    userId: user.id,
    phone,
    req,
    metadata: { flow: 'registration', misPatientCreated: !misPatientId },
  });
  auditLogService.log({
    event: AuditEvent.USER_PROFILE_CREATED,
    success: true,
    userId: user.id,
    phone,
    req,
  });
  auditLogService.log({
    event: AuditEvent.AUTH_LOGIN_SUCCESS,
    success: true,
    userId: user.id,
    phone,
    req,
    metadata: { flow: 'registration' },
  });

  return res.status(201).json({
    success: true,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
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

/**
 * Read-only session (login) history for the authenticated user. Lists past
 * OTP/PIN logins with device (User-Agent), IP and timestamp, most recent first.
 */
export const getSessions = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

  const safeLimit = Number.isNaN(limit) ? 50 : Math.min(Math.max(limit, 1), 100);
  const safeOffset = Number.isNaN(offset) ? 0 : Math.max(offset, 0);

  const sessions = await authService.getLoginHistory(req.user.id, safeLimit, safeOffset);

  return res.status(200).json({ success: true, data: sessions });
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
