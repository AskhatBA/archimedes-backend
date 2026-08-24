import { Request, Response } from 'express';
import { body, query, validationResult } from 'express-validator';

import { AppError } from '@/shared/services/app-error.service';
import * as auditLogService from '@/shared/services/audit-log.service';
import { AuditEvent } from '@/shared/services/audit-log.service';
import { useDemoAccount } from '@/shared/helpers';
import { Gender } from '@/shared/types/gender';

import * as misService from '../mis/mis.service';

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
