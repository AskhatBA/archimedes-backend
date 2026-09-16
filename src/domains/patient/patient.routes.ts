import { Router } from 'express';

import { Role } from '@prisma/client';

import { authenticate } from '@/middlewares/auth.middleware';
import { requireRole } from '@/middlewares/require-role.middleware';

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
 *         description: 12-digit Kazakhstan IIN. Validated for birth date, century/gender digit and control digit.
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{12}$'
 *     responses:
 *       200:
 *         description: Patient found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GetPatientByIinResponse'
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
 *           description: 12-digit Kazakhstan IIN. Validated for birth date, century/gender digit and control digit.
 *           pattern: '^\d{12}$'
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

/**
 * @openapi
 * /patient/admin/patients:
 *   get:
 *     summary: List every patient profile (dashboard, admin only)
 *     description: >
 *       Paginated listing of the patient profiles stored on our side, across all users.
 *       Requires an ADMIN account — a patient's mobile token authenticates but is
 *       rejected with 403. Rows are ordered by IIN: names are encrypted at rest, so the
 *       database cannot sort them. A name search is matched after decryption and its
 *       results come back in alphabetical order.
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: search
 *         description: Matches full name, IIN or phone
 *         schema:
 *           type: string
 *       - in: query
 *         name: gender
 *         schema:
 *           type: string
 *           enum: [M, F]
 *     responses:
 *       200:
 *         description: A page of patients
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       userId:
 *                         type: string
 *                       firstName:
 *                         type: string
 *                       lastName:
 *                         type: string
 *                       patronymic:
 *                         type: string
 *                       fullName:
 *                         type: string
 *                       birthDate:
 *                         type: string
 *                       gender:
 *                         type: string
 *                         enum: [M, F]
 *                       iin:
 *                         type: string
 *                       misPatientId:
 *                         type: string
 *                       phone:
 *                         type: string
 *                       email:
 *                         type: string
 *                         nullable: true
 *                       appointmentsCount:
 *                         type: integer
 *                       refundsCount:
 *                         type: integer
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *       400:
 *         description: Invalid pagination or filter values
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Authenticated, but not an admin
 */
router.get(
  '/admin/patients',
  authenticate,
  requireRole(Role.ADMIN),
  controller.getAdminPatients
);

/**
 * @openapi
 * /patient/admin/patients/{id}:
 *   patch:
 *     summary: Edit a patient's ФИО and IIN (dashboard, admin only)
 *     description: >
 *       Partial update — only the keys sent are written. The phone is not editable here:
 *       it lives on the user account and is the login, so sending `phone` (or any other
 *       key) is a 400. Changing the IIN re-resolves the patient in MIS and re-links
 *       `misPatientId`; an IIN MIS does not know (or MIS being unreachable) is refused with
 *       `MIS_PATIENT_NOT_FOUND`, never saved with a stale link.
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Patient profile id (not the user id)
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             additionalProperties: false
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               patronymic:
 *                 type: string
 *                 nullable: true
 *               iin:
 *                 type: string
 *                 pattern: '^\d{12}$'
 *     responses:
 *       200:
 *         description: The updated row, in the same shape as the listing
 *       400:
 *         description: Invalid or non-editable fields, or `MIS_PATIENT_NOT_FOUND` for the new IIN
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Authenticated, but not an admin
 *       404:
 *         description: "`PATIENT_PROFILE_NOT_FOUND`"
 *       409:
 *         description: >
 *           `PATIENT_IIN_TAKEN` — another profile has this IIN;
 *           `PATIENT_MIS_PATIENT_TAKEN` — the MIS patient is already linked to another profile
 *   delete:
 *     summary: Delete a patient profile, keeping the user account (dashboard, admin only)
 *     description: >
 *       Hard-deletes the `Patient` row only. The user account — phone, PIN, payments,
 *       appointments, orders — is left as is, so the person can still sign in by phone and
 *       create a new profile from the app.
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Patient profile id (not the user id)
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Deleted
 *       400:
 *         description: Invalid id
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Authenticated, but not an admin
 *       404:
 *         description: "`PATIENT_PROFILE_NOT_FOUND`"
 */
router.patch(
  '/admin/patients/:id',
  authenticate,
  requireRole(Role.ADMIN),
  controller.updateAdminPatient
);

router.delete(
  '/admin/patients/:id',
  authenticate,
  requireRole(Role.ADMIN),
  controller.deleteAdminPatient
);

export default router;
