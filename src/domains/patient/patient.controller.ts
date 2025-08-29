import { Request, Response } from 'express';

import { AppError } from '@/shared/services/app-error.service';

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

  const newPatient = await patientService.createPatient({
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    patronymic: req.body.patronymic,
    userId: req.user.id,
    birthDate: req.body.birthDate,
    gender: req.body.gender,
    iin: req.body.iin,
  });

  return res.status(200).json({ success: true, patient: newPatient });
};
