import { Request, Response } from 'express';
import { query, body, validationResult } from 'express-validator';

import { AppError } from '@/shared/services/app-error.service';
import { ErrorCodes } from '@/shared/constants/error-codes';

import * as insuranceService from './insurance.service';

export const sendOtp = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array(),
    });
  }

  const { phone, patient } = req.user;

  if (!patient) {
    throw new AppError(ErrorCodes.PATIENT_PROFILE_NOT_FOUND, 401);
  }

  await insuranceService.sendOtp(phone, patient.iin);

  return res.status(200).json({
    success: true,
    message: 'OTP has been sent',
  });
};

export const verifyOtp = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  await body('otp').notEmpty().withMessage('OTP is required').run(req);

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array(),
    });
  }

  const { otp } = req.body;

  await insuranceService.verifyOtp(req.user.phone, otp, req.user.id);

  return res.status(200).json({
    success: true,
    message: 'OTP successfully verified',
  });
};

export const refundRequest = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  // await body('date').notEmpty().withMessage('Phone is required').run(req);
  // await body('amount').notEmpty().withMessage('Phone is required').run(req);
  // await body('files')
  //   .withMessage('files is required')
  //   .bail()
  //   .isArray({ min: 1 })
  //   .withMessage('files must be a non-empty array')
  //   .run(req);
  //
  // await body('files.*').isObject().withMessage('each item in files must be an object').run(req);
  //
  // await body('files.*.fileType')
  //   .isString()
  //   .withMessage('fileType must be a string')
  //   .bail()
  //   .trim()
  //   .notEmpty()
  //   .withMessage('fileType is required')
  //   .run(req);
  //
  // await body('files.*.fileName')
  //   .isString()
  //   .withMessage('fileName must be a string')
  //   .bail()
  //   .trim()
  //   .notEmpty()
  //   .withMessage('fileName is required')
  //   .custom((name) => {
  //     if (!/\.(pdf|png|jpg|jpeg)$/i.test(name)) {
  //       throw new Error('fileName must end with .pdf, .png, .jpg or .jpeg');
  //     }
  //     return true;
  //   })
  //   .run(req);
  //
  // await body('files.*.content')
  //   .optional({ nullable: true, checkFalsy: true })
  //   .isBase64()
  //   .withMessage('content must be a base64 string when provided')
  //   .run(req);

  // const errors = validationResult(req);
  //
  // if (!errors.isEmpty()) {
  //   return res.status(400).json({
  //     success: false,
  //     message: errors.array(),
  //   });
  // }

  const { date, amount, files, personId, programId } = req.body;

  await insuranceService.requestRefund(
    {
      amount,
      date,
      files,
      personId,
      programId,
    },
    req.user.id
  );

  return res.status(200).json({
    success: true,
    message: 'Refund request successfully sent',
  });
};

export const getRefundRequests = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const userToken = await insuranceService.checkInsuranceToken(req.user.id);

  if (!userToken?.accessToken) {
    return res.status(404).json({
      success: false,
      message: 'User is not authorized',
    });
  }

  const refundRequests = await insuranceService.getRefundRequests(userToken.accessToken);

  return res.status(200).json({
    success: true,
    refundRequests,
  });
};

export const checkUserAuthorization = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const userToken = await insuranceService.checkInsuranceToken(req.user.id);
  const isUserAuthorized = !!userToken?.accessToken;

  return res.status(200).json({
    success: true,
    isUserAuthorized,
  });
};

export const getPrograms = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const userToken = await insuranceService.checkInsuranceToken(req.user.id);

  if (!userToken?.accessToken) {
    return res.status(404).json({
      success: false,
      message: 'User is not authorized',
    });
  }

  const programs = await insuranceService.getPrograms(userToken.accessToken);

  return res.status(200).json({
    success: true,
    programs,
  });
};

export const getProgramById = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const userToken = await insuranceService.checkInsuranceToken(req.user.id);

  if (!userToken?.accessToken) {
    return res.status(404).json({
      success: false,
      message: 'User is not authorized',
    });
  }

  const program = await insuranceService.getProgramById(
    userToken.accessToken,
    req.params.programId
  );

  return res.status(200).json({
    success: true,
    program,
  });
};

export const getFamily = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  await query('programId').notEmpty().withMessage('Program ID is required').run(req);

  const userToken = await insuranceService.checkInsuranceToken(req.user.id);

  if (!userToken?.accessToken) {
    return res.status(404).json({
      success: false,
      message: 'User is not authorized',
    });
  }

  const family = await insuranceService.getFamily(
    userToken.accessToken,
    req.query.programId as string
  );

  return res.status(200).json({
    success: true,
    family,
  });
};

export const getInsuranceCertificate = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const userToken = await insuranceService.checkInsuranceToken(req.user.id);

  if (!userToken?.accessToken) {
    return res.status(404).json({
      success: false,
      message: 'User is not authorized',
    });
  }

  const certificate = await insuranceService.getInsuranceCertificate(
    userToken.accessToken,
    req.params.programId
  );

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="certificate"`);
  return res.send(certificate);
};
