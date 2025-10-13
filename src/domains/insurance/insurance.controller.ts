import { Request, Response } from 'express';
import { query, body, validationResult } from 'express-validator';

import { AppError } from '@/shared/services/app-error.service';
import { ErrorCodes } from '@/shared/constants/error-codes';
import * as misService from '@/domains/mis/mis.service';

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

  const misInsurance = await misService.getUserInsuranceDetails(req.user.phone);

  if (!misInsurance.beneficiaryId) {
    return res.status(404).json({
      success: false,
      message: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS,
    });
  }

  await insuranceService.requestRefund(
    {
      amount,
      date,
      files,
      personId,
      programId,
    },
    misInsurance.beneficiaryId
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

  const misInsurance = await misService.getUserInsuranceDetails(req.user.phone);

  if (!misInsurance.beneficiaryId) {
    return res.status(404).json({
      success: false,
      message: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS,
    });
  }

  const refundRequests = await insuranceService.getRefundRequests(misInsurance.beneficiaryId);

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

  const misInsurance = await misService.getUserInsuranceDetails(req.user.phone);

  if (!misInsurance.beneficiaryId) {
    return res.status(404).json({
      success: false,
      message: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS,
    });
  }

  const programs = await insuranceService.getPrograms(misInsurance.beneficiaryId);

  return res.status(200).json({
    success: true,
    programs,
  });
};

export const getProgramById = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const misInsurance = await misService.getUserInsuranceDetails(req.user.phone);

  if (!misInsurance.beneficiaryId) {
    return res.status(404).json({
      success: false,
      message: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS,
    });
  }

  const program = await insuranceService.getProgramById(
    misInsurance.beneficiaryId,
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

  const misInsurance = await misService.getUserInsuranceDetails(req.user.phone);

  if (!misInsurance.beneficiaryId) {
    return res.status(404).json({
      success: false,
      message: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS,
    });
  }

  const family = await insuranceService.getFamily(
    misInsurance.beneficiaryId,
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

  const misInsurance = await misService.getUserInsuranceDetails(req.user.phone);

  if (!misInsurance.beneficiaryId) {
    return res.status(404).json({
      success: false,
      message: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS,
    });
  }

  const certificate = await insuranceService.getInsuranceCertificate(
    misInsurance.beneficiaryId,
    req.params.programId
  );

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="certificate"`);
  return res.send(certificate);
};

export const getAvailableCities = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const misInsurance = await misService.getUserInsuranceDetails(req.user.phone);

  if (!misInsurance.beneficiaryId) {
    return res.status(404).json({
      success: false,
      message: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS,
    });
  }

  const cities = await insuranceService.getAvailableCities(misInsurance.beneficiaryId);

  return res.status(200).json({
    success: true,
    cities,
  });
};

export const getMedicalNetwork = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  await query('cityId').notEmpty().withMessage('City ID is required').run(req);
  await query('programId').notEmpty().withMessage('Program ID is required').run(req);

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array(),
    });
  }

  const misInsurance = await misService.getUserInsuranceDetails(req.user.phone);

  if (!misInsurance.beneficiaryId) {
    return res.status(404).json({
      success: false,
      message: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS,
    });
  }

  const clinics = await insuranceService.getMedicalNetwork({
    token: misInsurance.beneficiaryId,
    programId: req.query.programId as string,
    cityId: req.query.cityId as string,
    type: req.query.type as string,
  });

  return res.status(200).json({
    success: true,
    clinics,
  });
};

export const getElectronicReferrals = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  await query('programId').notEmpty().withMessage('Program ID is required').run(req);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      errorCode: -1,
      data: [],
      message: errors.array(),
    });
  }

  const misInsurance = await misService.getUserInsuranceDetails(req.user.phone);

  if (!misInsurance.beneficiaryId) {
    return res.status(404).json({
      errorCode: -1,
      data: [],
      message: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS,
    });
  }

  const response = await insuranceService.getElectronicReferrals(
    misInsurance.beneficiaryId,
    req.query.programId as string
  );

  return res.status(200).json(response);
};
