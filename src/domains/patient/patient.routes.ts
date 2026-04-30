import { Router } from 'express';

import { authenticate } from '@/middlewares/auth.middleware';

import * as controller from './patient.controller';

const router = Router();

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
 *         user:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             phone:
 *               type: string
 *             role:
 *               type: string
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
 *             misPatientId:
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
router.get('/profile', authenticate, controller.getPatientProfile);

/**
 * @openapi
 * components:
 *   schemas:
 *     GetPatientByIinResponse:
 *       type: object
 *       properties:
 *         success:
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
 *             iin:
 *               type: string
 *             misPatientId:
 *               type: string
 * /patient/by-iin/{iin}:
 *   get:
 *     summary: Get patient info by IIN
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: iin
 *         in: path
 *         description: 12-digit IIN
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 12
 *           maxLength: 12
 *     responses:
 *       200:
 *         description: Patient found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GetPatientByIinResponse'
 *       400:
 *         description: Invalid IIN
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Patient not found
 */
router.get('/by-iin/:iin', authenticate, controller.getPatientByIin);

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
 *         - iin
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
 *         iin:
 *           type: string
 *         gender:
 *           type: string
 *           enum: [M, F]
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
 *       401:
 *         description: Unauthorized
 */
router.post('/profile', authenticate, controller.createPatientProfile);

router.post('/create-demo-patient', authenticate, controller.createDemoPatient);

export default router;
