import { Router } from 'express';

import { authenticate } from '@/middlewares/auth.middleware';

import * as controller from './mis.controller';

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     MISPatient:
 *       type: object
 *       required:
 *         - id
 *         - firstName
 *         - lastName
 *         - birthDate
 *         - gender
 *         - iin
 *       properties:
 *         id:
 *           type: string
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
 *           enum: [M, F]
 *         iin:
 *           type: string
 * /mis/find-patient:
 *   get:
 *     summary: Find patient by phone number
 *     tags: [MIS]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Patient found successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 patient:
 *                   $ref: '#/components/schemas/MISPatient'
 *       401:
 *         description: User not found or unauthorized
 */
router.get('/find-patient', authenticate, controller.findPatient);

/**
 * @openapi
 * components:
 *   schemas:
 *     CreateMISPatientBody:
 *       type: object
 *       required:
 *         - phoneNumber
 *         - firstName
 *         - lastName
 *         - gender
 *         - birthDate
 *         - iin
 *       properties:
 *         phoneNumber:
 *           type: string
 *           example: "77771234567"
 *         firstName:
 *           type: string
 *           example: "John"
 *         lastName:
 *           type: string
 *           example: "Doe"
 *         patronymic:
 *           type: string
 *           example: "Smith"
 *         gender:
 *           type: string
 *           enum: [M, F]
 *           example: "M"
 *         birthDate:
 *           type: string
 *           format: date
 *           example: "1990-01-01"
 *         iin:
 *           type: string
 *           example: "123456789012"
 * /mis/create-patient:
 *   post:
 *     summary: Create a new patient
 *     tags: [MIS]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateMISPatientBody'
 *     responses:
 *       200:
 *         description: Patient created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 description:
 *                   type: string
 *                   example: Patient created
 *       401:
 *         description: User not found or unauthorized
 */
router.post('/create-patient', authenticate, controller.createPatient);

export default router;
