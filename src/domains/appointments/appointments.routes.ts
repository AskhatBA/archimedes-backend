import { Router } from 'express';

import { Role } from '@prisma/client';

import { authenticate } from '@/middlewares/auth.middleware';
import { requireRole } from '@/middlewares/require-role.middleware';
import { asyncHandler } from '@/shared/services/async-handler.service';

import * as controller from './appointments.controller';

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     Appointment:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         patientId:
 *           type: string
 *           format: uuid
 *         doctorId:
 *           type: string
 *           format: uuid
 *         externalId:
 *           type: string
 *           format: uuid
 *         dateTime:
 *           type: string
 *           format: date-time
 *         status:
 *           type: string
 *           enum: [SCHEDULED, COMPLETED, CANCELLED]
 *         notes:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         patient:
 *           type: object
 *         doctor:
 *           type: object
 *     CreateAppointmentBody:
 *       type: object
 *       required:
 *         - patientId
 *         - doctorId
 *         - externalId
 *         - dateTime
 *       properties:
 *         patientId:
 *           type: string
 *           format: uuid
 *         doctorId:
 *           type: string
 *           format: uuid
 *         externalId:
 *           type: string
 *           format: uuid
 *         dateTime:
 *           type: string
 *           format: date-time
 *         notes:
 *           type: string
 *         status:
 *           type: string
 *           enum: [SCHEDULED, COMPLETED, CANCELLED]
 *     UpdateAppointmentBody:
 *       type: object
 *       properties:
 *         dateTime:
 *           type: string
 *           format: date-time
 *         status:
 *           type: string
 *           enum: [SCHEDULED, COMPLETED, CANCELLED]
 *         notes:
 *           type: string
 */

/**
 * @openapi
 * /appointments:
 *   get:
 *     summary: Get all appointments for the authenticated user
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of appointments retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 appointments:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Appointment'
 *       401:
 *         description: Unauthorized
 */
router.get('/', authenticate, controller.getAppointments);

/**
 * @openapi
 * /appointments/admin:
 *   get:
 *     summary: Clinic-wide appointment listing (dashboard)
 *     description: Admin-only. Paginated and filtered server-side; day filters are read in clinic time (Asia/Almaty).
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *       - name: search
 *         in: query
 *         description: Patient name, IIN or phone — or a MIS appointment/patient/doctor id.
 *         schema:
 *           type: string
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [SCHEDULED, COMPLETED, CANCELLED]
 *       - name: telemedicine
 *         in: query
 *         schema:
 *           type: boolean
 *       - name: dateFrom
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *       - name: dateTo
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Page of appointments
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Appointment'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not an admin
 */
router.get(
  '/admin',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(controller.getAdminAppointments)
);

/**
 * @openapi
 * /appointments/admin/sync:
 *   post:
 *     summary: Pull appointment statuses from MIS now (dashboard)
 *     description: >
 *       Runs the same sweep as the background schedule, on demand. Answers with what the
 *       sweep did — how many local appointments were checked and how many changed.
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sweep result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 checked:
 *                   type: integer
 *                 patients:
 *                   type: integer
 *                 updated:
 *                   type: integer
 *                 notFound:
 *                   type: integer
 *                 failedPatients:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not an admin
 */
router.post(
  '/admin/sync',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(controller.syncAppointmentStatuses)
);

/**
 * @openapi
 * /appointments/admin/{id}:
 *   get:
 *     summary: One appointment, unscoped (dashboard)
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Appointment
 *       403:
 *         description: Not an admin
 *       404:
 *         description: Appointment not found
 */
router.get(
  '/admin/:id',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(controller.getAdminAppointment)
);

/**
 * @openapi
 * /appointments/{id}:
 *   get:
 *     summary: Get appointment by ID
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Appointment ID
 *     responses:
 *       200:
 *         description: Appointment retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 appointment:
 *                   $ref: '#/components/schemas/Appointment'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Appointment not found
 */
// Registered after `/admin` so the dashboard routes are not swallowed by `:id`.
router.get('/:id', authenticate, controller.getAppointmentById);

/**
 * @openapi
 * /appointments:
 *   post:
 *     summary: Create a new appointment
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateAppointmentBody'
 *     responses:
 *       201:
 *         description: Appointment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 appointment:
 *                   $ref: '#/components/schemas/Appointment'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/', authenticate, controller.createAppointment);

/**
 * @openapi
 * /appointments/{id}:
 *   put:
 *     summary: Update an appointment
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Appointment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateAppointmentBody'
 *     responses:
 *       200:
 *         description: Appointment updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Appointment not found
 */
router.put('/:id', authenticate, controller.updateAppointment);

/**
 * @openapi
 * /appointments/{id}:
 *   delete:
 *     summary: Delete an appointment
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Appointment ID
 *     responses:
 *       200:
 *         description: Appointment deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Appointment not found
 */
router.delete('/:id', authenticate, controller.deleteAppointment);

/**
 * @openapi
 * /appointments/{id}/cancel:
 *   patch:
 *     summary: Cancel an appointment
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Appointment ID
 *     responses:
 *       200:
 *         description: Appointment cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Appointment not found
 */
router.patch('/:id/cancel', authenticate, controller.cancelAppointment);

export default router;
