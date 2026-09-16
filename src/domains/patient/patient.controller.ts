import { Request, Response } from 'express';
import { ValidationChain, body, param, query, validationResult } from 'express-validator';

import { AppError } from '@/shared/services/app-error.service';
import * as auditLogService from '@/shared/services/audit-log.service';
import { AuditEvent } from '@/shared/services/audit-log.service';
import { useDemoAccount } from '@/shared/helpers';
import { Gender } from '@/shared/types/gender';

import * as misService from '../mis/mis.service';

import * as patientAdminService from './patient.admin.service';
import type { AdminUpdatePatientBody } from './patient.dto';
import * as patientService from './patient.service';

export const getPatientProfile = async (req: Request, res: Response) => {
  if (!req?.user) {
    throw new AppError('User not found', 401);
  }

  const patient = await patientService.getPatientById(req.user.id);

  if (!patient) {
    return res.status(200).json({
      success: false,
      isProfileComplete: false,
      user: {
        id: req.user.id,
        phone: req.user.phone,
        role: req.user.role,
      },
      message: 'Patient not found',
    });
  }

  auditLogService.log({
    event: AuditEvent.PROFILE_VIEWED,
    success: true,
    userId: req.user.id,
    phone: req.user.phone,
    req,
  });

  return res.status(200).json({
    success: true,
    isProfileComplete: true,
    user: {
      id: req.user.id,
      phone: req.user.phone,
      role: req.user.role,
    },
    patient,
  });
};

export const getPatientByIin = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('User not found', 401);
  }

  const { iin } = req.params;

  const patient = await patientService.getPatientByIin(iin);

  if (!patient) {
    return res.status(404).json({ success: false, message: 'Patient not found' });
  }

  return res.status(200).json({ success: true, patient });
};

export const createPatientProfile = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('User not found', 401);
  }

  await body('firstName').notEmpty().withMessage('First name is required').run(req);
  await body('lastName').notEmpty().withMessage('Last name is required').run(req);
  await body('birthDate')
    .notEmpty()
    .isISO8601()
    .withMessage('Valid birth date is required')
    .run(req);
  await body('gender')
    .notEmpty()
    .isIn(['M', 'F'])
    .withMessage('Gender must be either M or F')
    .run(req);

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const iin = req.body.iin as string;

  const misPatient = await misService.findPatientByIinAndPhone(iin);

  if (!misPatient) {
    return res.status(400).json({
      success: false,
      message: 'Patient not found',
    });
  }

  const newPatient = await patientService.createPatient({
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    patronymic: req.body.patronymic,
    userId: req.user.id,
    birthDate: req.body.birthDate,
    gender: req.body.gender,
    iin,
    misPatientId: misPatient.id,
  });

  auditLogService.log({
    event: AuditEvent.USER_PROFILE_CREATED,
    success: true,
    userId: req.user.id,
    phone: req.user.phone,
    req,
    metadata: { iin },
  });

  return res.status(200).json({ success: true, patient: newPatient });
};

export const createDemoPatient = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('User not found', 401);
  }

  const { iin: demoIin } = useDemoAccount();

  const misPatient = await misService.findPatientByIinAndPhone('630301350211', '87775710058');

  if (!misPatient) {
    return res.status(400).json({
      success: false,
      message: 'Patient not found',
    });
  }

  const newPatient = await patientService.createPatient({
    firstName: 'Richard',
    lastName: 'Williams',
    patronymic: 'S.',
    userId: req.user.id,
    birthDate: '1963-03-01',
    gender: 'M',
    iin: demoIin,
    misPatientId: misPatient.id,
  });

  auditLogService.log({
    event: AuditEvent.USER_PROFILE_CREATED,
    success: true,
    userId: req.user.id,
    phone: req.user.phone,
    req,
    metadata: { iin: demoIin, demo: true },
  });

  return res.status(200).json({ success: true, patient: newPatient });
};

const PATIENT_LIST_MAX_LIMIT = 100;

/**
 * Dashboard-only listing of every patient profile. The route is gated on
 * `requireRole(Role.ADMIN)`, so a patient token is rejected with 403 in the middleware
 * and never reaches another patient's data. Every read is written to the audit trail —
 * this endpoint returns PII in bulk.
 */
export const getAdminPatients = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('User not found', 401);
  }

  await query('page').optional().isInt({ min: 1 }).withMessage('page must be >= 1').run(req);
  await query('limit')
    .optional()
    .isInt({ min: 1, max: PATIENT_LIST_MAX_LIMIT })
    .withMessage(`limit must be between 1 and ${PATIENT_LIST_MAX_LIMIT}`)
    .run(req);
  await query('gender')
    .optional()
    .isIn(['M', 'F'])
    .withMessage('gender must be either M or F')
    .run(req);

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array(),
    });
  }

  const { page, limit, search, gender } = req.query;

  const result = await patientService.getAdminPatients({
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 20,
    search: (search as string)?.trim() || undefined,
    gender: (gender as Gender) || undefined,
  });

  auditLogService.log({
    event: AuditEvent.PATIENT_LIST_VIEWED,
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

/** `phone` is not here on purpose: it lives on `User` and is the login. */
const EDITABLE_PATIENT_FIELDS = ['firstName', 'lastName', 'patronymic', 'iin'];

const NAME_MAX_LENGTH = 100;

const IIN_REGEX = /^\d{12}$/;

const patientIdRule = param('id').isUUID().withMessage('id must be a UUID');

/**
 * Unknown keys are refused rather than ignored: a dashboard that sends `phone` or
 * `birthDate` must hear that nothing happened, not get a 200 for an edit that was dropped.
 */
const patientUpdateRules: ValidationChain[] = [
  patientIdRule,
  body().custom((value: unknown) => {
    const keys = value && typeof value === 'object' ? Object.keys(value) : [];

    if (keys.includes('phone')) {
      throw new Error('phone cannot be changed');
    }

    const rejected = keys.filter((key) => !EDITABLE_PATIENT_FIELDS.includes(key));

    if (rejected.length) {
      throw new Error(
        `Only ${EDITABLE_PATIENT_FIELDS.join(', ')} can be edited, got: ${rejected.join(', ')}`
      );
    }

    if (!keys.length) {
      throw new Error(`Send at least one of ${EDITABLE_PATIENT_FIELDS.join(', ')}`);
    }

    return true;
  }),
  body('firstName')
    .optional()
    .isString()
    .bail()
    .trim()
    .notEmpty()
    .withMessage('firstName cannot be empty')
    .isLength({ max: NAME_MAX_LENGTH })
    .withMessage(`firstName must be at most ${NAME_MAX_LENGTH} characters`),
  body('lastName')
    .optional()
    .isString()
    .bail()
    .trim()
    .notEmpty()
    .withMessage('lastName cannot be empty')
    .isLength({ max: NAME_MAX_LENGTH })
    .withMessage(`lastName must be at most ${NAME_MAX_LENGTH} characters`),
  body('patronymic')
    .optional({ values: 'null' })
    .isString()
    .bail()
    .trim()
    .isLength({ max: NAME_MAX_LENGTH })
    .withMessage(`patronymic must be at most ${NAME_MAX_LENGTH} characters`),
  body('iin')
    .optional()
    .isString()
    .bail()
    .trim()
    .matches(IIN_REGEX)
    .withMessage('iin must be exactly 12 digits'),
];

const failedValidation = async (
  req: Request,
  res: Response,
  chains: ValidationChain[]
): Promise<boolean> => {
  await Promise.all(chains.map((chain) => chain.run(req)));

  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return false;
  }

  res.status(400).json({ success: false, errors: errors.array() });

  return true;
};

/**
 * Dashboard edit of a patient's ФИО and IIN. Admin-only — the route is behind
 * `requireRole(Role.ADMIN)`. A changed IIN re-links the profile to its MIS patient.
 */
export const updateAdminPatient = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('User not found', 401);
  }

  if (await failedValidation(req, res, patientUpdateRules)) {
    return;
  }

  const { patient, changedFields, relinked } = await patientAdminService.updatePatient(
    req.params.id as string,
    req.body as AdminUpdatePatientBody
  );

  auditLogService.log({
    event: AuditEvent.PATIENT_PROFILE_UPDATED,
    success: true,
    userId: req.user.id,
    phone: req.user.phone,
    req,
    metadata: {
      patientId: patient.id,
      patientUserId: patient.userId,
      // Names are encrypted at rest, so only which fields changed is recorded — never
      // their values in the clear. The IIN is stored in the clear anyway.
      fields: changedFields,
      ...(relinked && {
        previousIin: relinked.previousIin,
        iin: patient.iin,
        previousMisPatientId: relinked.previousMisPatientId,
        misPatientId: patient.misPatientId,
      }),
    },
  });

  return res.status(200).json({ success: true, patient });
};

/**
 * Deletes the patient profile only — the `User` row is never touched. Admin-only.
 */
export const deleteAdminPatient = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('User not found', 401);
  }

  if (await failedValidation(req, res, [patientIdRule])) {
    return;
  }

  const patient = await patientAdminService.deletePatient(req.params.id as string);

  auditLogService.log({
    event: AuditEvent.PATIENT_PROFILE_DELETED,
    success: true,
    userId: req.user.id,
    phone: req.user.phone,
    req,
    metadata: {
      patientId: patient.id,
      patientUserId: patient.userId,
      iin: patient.iin,
      misPatientId: patient.misPatientId,
    },
  });

  return res
    .status(200)
    .json({ success: true, patient: { id: patient.id, userId: patient.userId } });
};
