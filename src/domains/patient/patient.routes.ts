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

export default router;
