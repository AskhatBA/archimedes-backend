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
 *     AppointmentRefundPlan:
 *       type: object
 *       description: How a cancellation right now would split the money.
 *       properties:
 *         paidAmount:
 *           type: number
 *           description: What the visit cost, in tenge.
 *         refundPercent:
 *           type: integer
 *           description: Share of paidAmount coming back — 100 inside the free window.
 *           example: 70
 *         amount:
 *           type: number
 *           description: What the patient gets back, in tenge.
 *         feeAmount:
 *           type: number
 *           description: Compensation kept for a late cancellation.
 *         hoursBefore:
 *           type: number
 *           description: Hours left until the visit.
 *         freeCancellationUntil:
 *           type: string
 *           format: date-time
 *           description: Up to this moment the cancellation is still free.
 *     AppointmentRefund:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         appointmentId:
 *           type: string
 *           format: uuid
 *         paidAmount:
 *           type: number
 *         refundPercent:
 *           type: integer
 *         amount:
 *           type: number
 *         feeAmount:
 *           type: number
 *         hoursBefore:
 *           type: number
 *         status:
 *           type: string
 *           enum: [PENDING, COMPLETED, FAILED]
 *           description: >
 *             PENDING — owed but not yet reversed at FreedomPay, COMPLETED — on its way back
 *             to the card, FAILED — the provider refused and an operator has to post it.
 *         comment:
 *           type: string
 *           nullable: true
 *         refundedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
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
 * /appointments/history:
 *   get:
 *     summary: The caller's own booking history
 *     description: >
 *       Every visit booked through the app, read from our own table rather than proxied
 *       from MIS — cancelled ones included — newest first. Doctor and branch are resolved
 *       from MIS and come back `null` when it is unreachable. `paidAmount` is `null` for a
 *       visit booked through an insurance programme; `refund` is set for a cancelled paid one.
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Booking history
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
 *                     $ref: '#/components/schemas/AppointmentHistoryItem'
 *       401:
 *         description: Unauthorized
 * components:
 *   schemas:
 *     AppointmentHistoryItem:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         externalId:
 *           type: string
 *           format: uuid
 *           description: MIS id the visit is known by
 *         dateTime:
 *           type: string
 *           format: date-time
 *         status:
 *           type: string
 *           enum: [SCHEDULED, COMPLETED, CANCELLED]
 *         isTelemedicine:
 *           type: boolean
 *         doctorName:
 *           type: string
 *           nullable: true
 *         doctorSpecialty:
 *           type: string
 *           nullable: true
 *         branchName:
 *           type: string
 *           nullable: true
 *         branchAddress:
 *           type: string
 *           nullable: true
 *         isForFamilyMember:
 *           type: boolean
 *         paidAmount:
 *           type: number
 *           nullable: true
 *         refund:
 *           type: object
 *           nullable: true
 *           properties:
 *             amount:
 *               type: number
 *             feeAmount:
 *               type: number
 *             status:
 *               type: string
 *               enum: [PENDING, COMPLETED, FAILED]
 *             refundedAt:
 *               type: string
 *               format: date-time
 *               nullable: true
 *         cancelledAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 */
// Registered before `/:id`, otherwise the by-id handler swallows it.
router.get('/history', authenticate, asyncHandler(controller.getAppointmentHistory));

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
 *       - name: paid
 *         in: query
 *         description: >
 *           `true` — only visits paid for by card (there is a settled payment behind them),
 *           `false` — only visits booked through an insurance programme.
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
 * /appointments/admin/refunds:
 *   get:
 *     summary: Refund queue for cancelled paid appointments (dashboard)
 *     description: >
 *       Money owed back for visits the patient cancelled. `PENDING` is waiting on FreedomPay
 *       (or on an operator, when automatic refunds are switched off), `COMPLETED` is on its
 *       way back to the card, and `FAILED` means the provider refused: the patient has been
 *       charged, their visit is gone, and the reversal has to be posted from the merchant
 *       cabinet by hand. `totalAmount` sums the whole filtered set, not the page.
 *     tags: [Appointments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, COMPLETED, FAILED]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Patient name, IIN or phone
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Paginated refunds
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not an admin
 */
router.get(
  '/admin/refunds',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(controller.getAdminRefunds)
);

/**
 * @openapi
 * /appointments/admin/refunds/{id}:
 *   patch:
 *     summary: Record what happened to a refund (dashboard)
 *     description: >
 *       Only `status` and `comment`: the amount belongs to the payment and is immutable, and
 *       `refundedAt` follows `status` rather than being editable on its own, so the queue
 *       cannot lie about what has been posted. FreedomPay is deliberately not called from
 *       here — a second `revoke` on the same payment would refund the money twice, so this is
 *       for recording a reversal an operator already made in the merchant cabinet.
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
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PENDING, COMPLETED, FAILED]
 *               comment:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Updated refund
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not an admin
 *       404:
 *         description: Refund not found
 */
router.patch(
  '/admin/refunds/:id',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(controller.updateAdminRefund)
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
 *     summary: Cancel an appointment, refunding a paid one
 *     description: >
 *       Cancels the visit in MIS first — nothing changes on our side while the booking is
 *       still live there. A visit paid for by card then gets a refund queued for FreedomPay:
 *       the whole amount when cancelled at least 12 hours ahead, 70% of it after that. A visit
 *       booked through an insurance programme is simply removed. Accepts either our
 *       appointment id or the MIS id the app knows the visit by.
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
 *         description: Appointment ID, or the MIS appointment/request ID
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
 *                 appointmentId:
 *                   type: string
 *                   format: uuid
 *                 status:
 *                   type: string
 *                   enum: [CANCELLED]
 *                 refund:
 *                   nullable: true
 *                   $ref: '#/components/schemas/AppointmentRefund'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Appointment not found
 *       409:
 *         description: >
 *           `APPOINTMENT_NOT_CANCELLABLE` (already cancelled or completed) or
 *           `APPOINTMENT_ALREADY_STARTED` (the visit time has passed)
 *       default:
 *         description: >
 *           MIS refused the cancellation and its status is passed through — nothing was
 *           changed on our side and no refund was made
 */
router.patch('/:id/cancel', authenticate, asyncHandler(controller.cancelAppointment));

/**
 * @openapi
 * /appointments/{id}/cancellation:
 *   get:
 *     summary: Preview what cancelling this appointment would cost
 *     description: >
 *       Answers the question the confirmation screen asks: is there money behind this visit,
 *       and how much of it comes back if it is cancelled right now. A visit booked through an
 *       insurance programme has `isPaid: false` and no `refund`. Cancelling at least
 *       `APPOINTMENT_REFUND_FULL_WINDOW_HOURS` (12 by default) before the visit returns 100%;
 *       later than that keeps a compensation (30% by default). Accepts either our appointment
 *       id or the MIS id the app knows the visit by.
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
 *         description: Appointment ID, or the MIS appointment/request ID
 *     responses:
 *       200:
 *         description: What cancelling now would do
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 appointmentId:
 *                   type: string
 *                   format: uuid
 *                 externalId:
 *                   type: string
 *                   format: uuid
 *                 dateTime:
 *                   type: string
 *                   format: date-time
 *                 isPaid:
 *                   type: boolean
 *                 refund:
 *                   nullable: true
 *                   $ref: '#/components/schemas/AppointmentRefundPlan'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Appointment not found
 *       409:
 *         description: >
 *           `APPOINTMENT_NOT_CANCELLABLE` (already cancelled or completed) or
 *           `APPOINTMENT_ALREADY_STARTED` (the visit time has passed)
 */
router.get('/:id/cancellation', authenticate, asyncHandler(controller.getCancellationPreview));

export default router;
