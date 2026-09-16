import { Request, Response } from 'express';
import { query, body, validationResult, param } from 'express-validator';

import { AppError } from '@/shared/services/app-error.service';
import { ErrorCodes } from '@/shared/constants/error-codes';
import * as auditLogService from '@/shared/services/audit-log.service';
import { AuditEvent } from '@/shared/services/audit-log.service';
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

  const { date, amount, files, personId, programId, category, comments } = req.body;

  const misInsurance = await misService.getUserInsuranceDetails(req.user.id, req.user.phone);

  if (!misInsurance?.beneficiaryId) {
    auditLogService.log({
      event: AuditEvent.REFUND_ACCESS_DENIED,
      success: false,
      userId: req.user.id,
      phone: req.user.phone,
      req,
      metadata: { reason: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS },
    });
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
      category,
      comments,
    },
    misInsurance.beneficiaryId,
    req.user.id
  );

  auditLogService.log({
    event: AuditEvent.REFUND_REQUESTED,
    success: true,
    userId: req.user.id,
    phone: req.user.phone,
    req,
    metadata: { amount: amount as number, date: date as string, programId: programId as string },
  });

  return res.status(200).json({
    success: true,
    message: 'Refund request successfully sent',
  });
};

export const getRefundRequests = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const misInsurance = await misService.getUserInsuranceDetails(req.user.id, req.user.phone);

  if (!misInsurance?.beneficiaryId) {
    auditLogService.log({
      event: AuditEvent.REFUND_ACCESS_DENIED,
      success: false,
      userId: req.user.id,
      phone: req.user.phone,
      req,
      metadata: { reason: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS, source: 'mis' },
    });
    return res.status(404).json({
      success: false,
      message: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS,
    });
  }

  const refundRequests = await insuranceService.getRefundRequests(misInsurance.beneficiaryId);

  auditLogService.log({
    event: AuditEvent.REFUND_REQUESTS_VIEWED,
    success: true,
    userId: req.user.id,
    phone: req.user.phone,
    req,
    metadata: { source: 'mis' },
  });

  return res.status(200).json({
    success: true,
    refundRequests,
  });
};

export const getLocalRefundRequests = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const refundRequests = await insuranceService.getLocalRefundRequests(req.user.id);

  auditLogService.log({
    event: AuditEvent.REFUND_REQUESTS_VIEWED,
    success: true,
    userId: req.user.id,
    phone: req.user.phone,
    req,
    metadata: { source: 'local' },
  });

  return res.status(200).json({
    success: true,
    refundRequests,
  });
};

export const getPrograms = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const misInsurance = await misService.getUserInsuranceDetails(req.user.id, req.user.phone);

  if (!misInsurance?.beneficiaryId) {
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

  const misInsurance = await misService.getUserInsuranceDetails(req.user.id, req.user.phone);

  if (!misInsurance?.beneficiaryId) {
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

  const misInsurance = await misService.getUserInsuranceDetails(req.user.id, req.user.phone);

  if (!misInsurance?.beneficiaryId) {
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

  const misInsurance = await misService.getUserInsuranceDetails(req.user.id, req.user.phone);

  if (!misInsurance?.beneficiaryId) {
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

  const misInsurance = await misService.getUserInsuranceDetails(req.user.id, req.user.phone);

  if (!misInsurance?.beneficiaryId) {
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

  const misInsurance = await misService.getUserInsuranceDetails(req.user.id, req.user.phone);

  if (!misInsurance?.beneficiaryId) {
    return res.status(404).json({
      success: false,
      message: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS,
    });
  }

  const clinics = await insuranceService.getMedicalNetwork({
    beneficiaryId: misInsurance.beneficiaryId,
    programId: req.query.programId as string,
    cityId: req.query.cityId as string,
    type: req.query.type as string,
  });

  return res.status(200).json({
    success: true,
    clinics,
  });
};

export const getContacts = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const misInsurance = await misService.getUserInsuranceDetails(req.user.id, req.user.phone);

  if (!misInsurance?.beneficiaryId) {
    return res.status(404).json({
      success: false,
      message: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS,
    });
  }

  const contacts = await insuranceService.getContacts(misInsurance.beneficiaryId);

  return res.status(200).json({
    success: true,
    contacts,
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

  const misInsurance = await misService.getUserInsuranceDetails(req.user.id, req.user.phone);

  if (!misInsurance?.beneficiaryId) {
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

  return res.status(200).json({
    success: true,
    electronicReferrals: response,
  });
};

export const getClinicTypes = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const misInsurance = await misService.getUserInsuranceDetails(req.user.id, req.user.phone);

  if (!misInsurance?.beneficiaryId) {
    return res.status(404).json({
      success: false,
      message: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS,
    });
  }

  const response = await insuranceService.getClinicTypes(misInsurance.beneficiaryId);

  return res.status(200).json({
    success: true,
    clinicTypes: response,
  });
};

export const getNews = async (_req: Request, res: Response) => {
  const news = await insuranceService.getNews();

  return res.status(200).json({
    success: true,
    news,
  });
};

export const getQrAppointments = async (req: Request, res: Response) => {
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

  const misInsurance = await misService.getUserInsuranceDetails(req.user.id, req.user.phone);

  if (!misInsurance?.beneficiaryId) {
    return res.status(404).json({
      success: false,
      message: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS,
    });
  }

  const data = await insuranceService.getQrAppointments(
    misInsurance.beneficiaryId,
    req.query.clinicId as string
  );

  return res.status(200).json({
    success: true,
    data,
  });
};

export const submitQrAppointment = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  await query('appCode').notEmpty().withMessage('appCode is required').isInt().run(req);
  await query('clinicId').notEmpty().withMessage('clinicId is required').run(req);

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array(),
    });
  }

  const misInsurance = await misService.getUserInsuranceDetails(req.user.id, req.user.phone);

  if (!misInsurance?.beneficiaryId) {
    return res.status(404).json({
      success: false,
      message: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS,
    });
  }

  const data = await insuranceService.submitQrAppointment(
    misInsurance.beneficiaryId,
    req.query.clinicId as string,
    Number(req.query.appCode)
  );

  return res.status(200).json({
    success: true,
    data,
  });
};

export const getPriceList = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  await query('clinicId').notEmpty().withMessage('clinicId is required').run(req);

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array(),
    });
  }

  const misInsurance = await misService.getUserInsuranceDetails(req.user.id, req.user.phone);

  if (!misInsurance?.beneficiaryId) {
    return res.status(404).json({
      success: false,
      message: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS,
    });
  }

  const priceList = await insuranceService.getPriceList(
    misInsurance.beneficiaryId,
    req.query.clinicId as string
  );

  return res.status(200).json({
    success: true,
    priceList,
  });
};

export const getMedicService = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  await query('clinicId').notEmpty().withMessage('clinicId is required').run(req);
  await query('medicIIN').notEmpty().withMessage('medicIIN is required').run(req);

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array(),
    });
  }

  const misInsurance = await misService.getUserInsuranceDetails(req.user.id, req.user.phone);

  if (!misInsurance?.beneficiaryId) {
    return res.status(404).json({
      success: false,
      message: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS,
    });
  }

  const medicService = await insuranceService.getMedicService(
    misInsurance.beneficiaryId,
    req.query.clinicId as string,
    req.query.medicIIN as string
  );

  return res.status(200).json({
    success: true,
    medicService,
  });
};

export const getServicePrice = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  await query('clinicId').notEmpty().withMessage('clinicId is required').run(req);
  await query('serviceId').notEmpty().withMessage('serviceId is required').run(req);

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array(),
    });
  }

  const misInsurance = await misService.getUserInsuranceDetails(req.user.id, req.user.phone);

  if (!misInsurance?.beneficiaryId) {
    return res.status(404).json({
      success: false,
      message: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS,
    });
  }

  const servicePrice = await insuranceService.getServicePrice(
    misInsurance.beneficiaryId,
    req.query.clinicId as string,
    req.query.serviceId as string
  );

  return res.status(200).json({
    success: true,
    servicePrice,
  });
};

export const getClinicsMO = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const misInsurance = await misService.getUserInsuranceDetails(req.user.id, req.user.phone);

  if (!misInsurance?.beneficiaryId) {
    return res.status(404).json({
      success: false,
      message: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS,
    });
  }

  const clinicsMO = await insuranceService.getClinicsMO(misInsurance.beneficiaryId);

  return res.status(200).json({
    success: true,
    clinicsMO,
  });
};

export const getPayPrograms = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const misInsurance = await misService.getUserInsuranceDetails(req.user.id, req.user.phone);

  if (!misInsurance?.beneficiaryId) {
    return res.status(404).json({
      success: false,
      message: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS,
    });
  }

  const payPrograms = await insuranceService.getPayPrograms(misInsurance.beneficiaryId);

  return res.status(200).json({
    success: true,
    payPrograms,
  });
};

export const getMedAccount = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const misInsurance = await misService.getUserInsuranceDetails(req.user.id, req.user.phone);

  if (!misInsurance?.beneficiaryId) {
    return res.status(404).json({
      success: false,
      message: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS,
    });
  }

  const medAccount = await insuranceService.getMedAccount(misInsurance.beneficiaryId);

  return res.status(200).json({
    success: true,
    medAccount,
  });
};

export const checkIin = async (req: Request, res: Response) => {
  const iin = req.query.iin as string;

  const result = await insuranceService.checkIin(iin);

  return res.status(200).json(result);
};

export const updateElectronicReferralServiceStatus = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  await param('electronicReferralId')
    .notEmpty()
    .withMessage('Electronic referral id is required')
    .run(req);
  await body('serviceStatus')
    .notEmpty()
    .withMessage('Service status referral id is required')
    .run(req);
  await body('satisfactionLevel')
    .notEmpty()
    .withMessage('Service status referral id is required')
    .run(req);

  const misInsurance = await misService.getUserInsuranceDetails(req.user.id, req.user.phone);

  if (!misInsurance?.beneficiaryId) {
    return res.status(404).json({
      success: false,
      message: ErrorCodes.INSURANCE_NOT_FOUND_IN_MIS,
    });
  }

  await insuranceService.updateElectronicReferralServiceStatus(
    misInsurance.beneficiaryId,
    req.params.electronicReferralId,
    req.body.serviceStatus,
    req.body.satisfactionLevel
  );

  return res.status(200).json({
    success: true,
  });
};

const REFUND_CATEGORIES = [0, 2, 4, 5];
const REFUND_LIST_MAX_LIMIT = 100;

/**
 * Dashboard-only listing of every refund request in the system. The route is gated on
 * `requireRole(Role.ADMIN)`, so a patient token never gets here — it fails with 403 in
 * the middleware, which is also where the mobile scoping guarantee comes from.
 */
export const getAdminRefundRequests = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  await query('page').optional().isInt({ min: 1 }).withMessage('page must be >= 1').run(req);
  await query('limit')
    .optional()
    .isInt({ min: 1, max: REFUND_LIST_MAX_LIMIT })
    .withMessage(`limit must be between 1 and ${REFUND_LIST_MAX_LIMIT}`)
    .run(req);
  await query('category')
    .optional()
    .isIn(REFUND_CATEGORIES)
    .withMessage('Unknown refund category')
    .run(req);
  await query('dateFrom')
    .optional()
    .isISO8601()
    .withMessage('dateFrom must be an ISO date')
    .run(req);
  await query('dateTo').optional().isISO8601().withMessage('dateTo must be an ISO date').run(req);

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array(),
    });
  }

  const { page, limit, search, category, dateFrom, dateTo } = req.query;

  const result = await insuranceService.getAdminRefundRequests({
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 20,
    search: (search as string)?.trim() || undefined,
    category: category !== undefined ? Number(category) : undefined,
    dateFrom: (dateFrom as string) || undefined,
    dateTo: (dateTo as string) || undefined,
  });

  auditLogService.log({
    event: AuditEvent.REFUND_REQUESTS_VIEWED,
    success: true,
    userId: req.user.id,
    phone: req.user.phone,
    req,
    metadata: { source: 'admin', page: result.page, total: result.total },
  });

  return res.status(200).json({
    success: true,
    ...result,
  });
};
