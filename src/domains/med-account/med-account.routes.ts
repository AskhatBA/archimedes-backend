import { Router } from 'express';

import { Role } from '@prisma/client';

import { authenticate } from '@/middlewares/auth.middleware';
import { requireRole } from '@/middlewares/require-role.middleware';
import { asyncHandler } from '@/shared/services/async-handler.service';

import * as controller from './med-account.controller';
// ⚠️ TEMPORARY — remove together with the sandbox route at the bottom of this file.
import * as sandboxController from './med-account.sandbox.controller';

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     MedAccountOptionItem:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         amount:
 *           type: number
 *           description: Amount in tenge
 *           example: 100000
 *         label:
 *           type: string
 *           nullable: true
 *           example: "Хватит на приём терапевта"
 *         popular:
 *           type: boolean
 *     MedAccountOptionAdminItem:
 *       allOf:
 *         - $ref: '#/components/schemas/MedAccountOptionItem'
 *         - type: object
 *           properties:
 *             isActive:
 *               type: boolean
 *             sortOrder:
 *               type: number
 *               example: 10
 *             createdAt:
 *               type: string
 *               format: date-time
 *             updatedAt:
 *               type: string
 *               format: date-time
 *     MedAccountOptionWriteBody:
 *       type: object
 *       required: [amount]
 *       properties:
 *         amount:
 *           type: number
 *           description: Amount in tenge, unique across the list
 *           example: 100000
 *         label:
 *           type: string
 *           nullable: true
 *         popular:
 *           type: boolean
 *         isActive:
 *           type: boolean
 *         sortOrder:
 *           type: number
 *     MedAccountTopup:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         amount:
 *           type: number
 *           example: 100000
 *         status:
 *           type: string
 *           enum: [PENDING, CREDITED, FAILED]
 *         paymentId:
 *           type: string
 *           format: uuid
 *         optionId:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         externalRef:
 *           type: string
 *           nullable: true
 *         comment:
 *           type: string
 *           nullable: true
 *         creditedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 * /med-account/options:
 *   get:
 *     summary: Amounts a patient can top the medical account up by
 *     tags: [MedAccount]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active top-up amounts, in display order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 options:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MedAccountOptionItem'
 *       401:
 *         description: Unauthorized
 */
router.get('/options', authenticate, asyncHandler(controller.getOptions));

/**
 * @openapi
 * /med-account/options/admin:
 *   get:
 *     summary: The whole list, including unpublished amounts (Admin only)
 *     tags: [MedAccount]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Top-up amounts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 options:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MedAccountOptionAdminItem'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin role required
 *   post:
 *     summary: Add a top-up amount (Admin only)
 *     tags: [MedAccount]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MedAccountOptionWriteBody'
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Validation error
 *       403:
 *         description: Forbidden — admin role required
 *       409:
 *         description: This amount is already on the list
 */
router.get(
  '/options/admin',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(controller.getAdminOptions)
);
router.post(
  '/options/admin',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(controller.createOption)
);

/**
 * @openapi
 * /med-account/options/admin/{id}:
 *   patch:
 *     summary: Update a top-up amount (Admin only)
 *     tags: [MedAccount]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       description: Only the fields being changed
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MedAccountOptionWriteBody'
 *     responses:
 *       200:
 *         description: Updated
 *       404:
 *         description: Amount not found
 *       409:
 *         description: This amount is already on the list
 *   delete:
 *     summary: Remove a top-up amount (Admin only)
 *     tags: [MedAccount]
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
 *         description: Deleted
 *       404:
 *         description: Amount not found
 */
router.patch(
  '/options/admin/:id',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(controller.updateOption)
);
router.delete(
  '/options/admin/:id',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(controller.deleteOption)
);

/**
 * @openapi
 * /med-account/topups/admin:
 *   get:
 *     summary: Paid top-ups awaiting or already posted to the medical account (Admin only)
 *     tags: [MedAccount]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [PENDING, CREDITED, FAILED]
 *       - name: search
 *         in: query
 *         description: Patient name, IIN or phone
 *         schema:
 *           type: string
 *       - name: dateFrom
 *         in: query
 *         schema:
 *           type: string
 *           example: "2026-01-01"
 *       - name: dateTo
 *         in: query
 *         schema:
 *           type: string
 *           example: "2026-01-31"
 *     responses:
 *       200:
 *         description: Paginated top-ups plus the summed amount of the filtered set
 *       403:
 *         description: Forbidden — admin role required
 */
router.get(
  '/topups/admin',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(controller.getAdminTopups)
);

/**
 * @openapi
 * /med-account/topups/admin/{id}:
 *   patch:
 *     summary: Move a top-up along or leave an operator note (Admin only)
 *     tags: [MedAccount]
 *     description: >
 *       Only `status` and `comment` are writable — the amount belongs to the payment behind
 *       the top-up and is immutable. Marking a top-up CREDITED stamps `creditedAt`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PENDING, CREDITED, FAILED]
 *               comment:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Updated
 *       404:
 *         description: Top-up not found
 */
router.patch(
  '/topups/admin/:id',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(controller.updateTopup)
);

/**
 * @openapi
 * /med-account/topups:
 *   get:
 *     summary: The caller's own top-up history, newest first
 *     tags: [MedAccount]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Top-ups
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 topups:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MedAccountTopup'
 *       401:
 *         description: Unauthorized
 */
// Registered after `/topups/admin` so the admin listing is matched by its own handler.
router.get('/topups', authenticate, asyncHandler(controller.getMyTopups));

/* ------------------------------------------------------------------------------------ *
 * ⚠️ TEMPORARY SANDBOX ROUTE — DELETE THIS BLOCK AND `med-account.sandbox.controller.ts` *
 * ------------------------------------------------------------------------------------ */

/**
 * @openapi
 * /med-account/test/topup:
 *   post:
 *     summary: "[TEST] Credit the medical account directly, with no payment (temporary)"
 *     tags: [MedAccount]
 *     description: >
 *       Calls the insurer's `/v3/topupBalance` for the authenticated patient, bypassing
 *       FreedomPay. Writes nothing to our tables — no payment, no top-up row, no audit
 *       entry — but the credit on the insurer's side is real. Any field of the insurer's
 *       body can be overridden; anything omitted is what the paid path would have sent.
 *       Both the request body sent and the insurer's answer come back, and an insurer
 *       refusal is returned as `success: false` with a 200 rather than as an error status.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Amount in tenge
 *                 example: 1000
 *               beneficiaryId:
 *                 type: string
 *                 description: Overrides the id resolved from MIS (the Authorization header)
 *               insuranceId:
 *                 type: string
 *                 nullable: true
 *                 description: 'Program id; send null to test a patient with no med-account program'
 *               lastName:
 *                 type: string
 *               firstName:
 *                 type: string
 *               middleName:
 *                 type: string
 *               iin:
 *                 type: string
 *               dateBirth:
 *                 type: string
 *                 example: "1963-03-01T00:00:00.000Z"
 *               phoneMobile:
 *                 type: string
 *     responses:
 *       200:
 *         description: The body sent to the insurer and what it answered
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized, or the account has no patient profile
 */
router.post('/test/topup', authenticate, asyncHandler(sandboxController.topupDirectly));

/* ----------------------------- end of temporary block ------------------------------- */

export default router;
