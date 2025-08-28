import { Request, Response } from 'express';

import { AppError } from '@/shared/services/app-error.service';

import * as patientService from './patient.service';

/**
 * @openapi
 * components:
 *   schemas:
 *     GetPatientProfileResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         isProfileComplete:
 *           type: boolean
 *         patient:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             userId:
 *               type: string
 *             firstName:
 *               type: string
 *             lastName:
 *               type: string
 *             patronymic:
 *               type: string
 *             fullName:
 *               type: string
 *             birthDate:
 *               type: string
 *             gender:
 *               type: string
 * /patient/profile:
 *   get:
 *     summary: Get patient profile
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Patient profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GetPatientProfileResponse'
 *       401:
 *         description: Unauthorized
 */
export const getPatientProfile = async (req: Request, res: Response) => {
  if (!req?.user) {
    throw new AppError('User not found', 401);
  }

  const patient = await patientService.getPatientById(req.user.id);

  if (!patient) {
    return res.status(200).json({
      success: false,
      isProfileComplete: false,
      message: 'Patient not found',
    });
  }

  return res.status(200).json({
    success: true,
    isProfileComplete: true,
    patient,
  });
};

/**
 * @openapi
 * components:
 *   schemas:
 *     CreatePatientBody:
 *       type: object
 *       required:
 *         - firstName
 *         - lastName
 *         - birthDate
 *         - gender
 *       properties:
 *         firstName:
 *           type: string
 *         lastName:
 *           type: string
 *         patronymic:
 *           type: string
 *         birthDate:
 *           type: string
 *           format: date
 *         gender:
 *           type: string
 *           enum: [MALE, FEMALE]
 * /patient/profile:
 *   post:
 *     summary: Create patient profile
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             $ref: '#/components/schemas/CreatePatientBody'
 *     responses:
 *       200:
 *         description: Patient profile created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 patient:
 *                   $ref: '#/components/schemas/Patient'
 *       401:
 *         description: Unauthorized
 */
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
  });

  return res.status(200).json({ success: true, patient: newPatient });
};
