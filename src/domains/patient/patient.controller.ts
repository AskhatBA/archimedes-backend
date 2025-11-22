import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';

import { AppError } from '@/shared/services/app-error.service';
import { useDemoAccount } from '@/shared/helpers';

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
  await body('iin')
    .notEmpty()
    .isLength({ min: 12, max: 12 })
    .withMessage('IIN must be 12 characters')
    .run(req);
  await body('gender')
    .notEmpty()
    .isIn(['M', 'F'])
    .withMessage('Gender must be either M or F')
    .run(req);

  const { isDemoAccount } = useDemoAccount();
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  let phone = req.user.phone.slice(1);

  if (isDemoAccount(req.user.phone, req.body.iin)) {
    phone = '7775710058';
  }

  const misPatient = await misService.findPatientByIinAndPhone(req.body.iin, `8${phone}`);

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
    iin: req.body.iin,
    misPatientId: misPatient.id,
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

  return res.status(200).json({ success: true, patient: newPatient });
};
