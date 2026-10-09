import { Router } from 'express';
import { Role } from '@prisma/client';

import { authenticate } from '@/middlewares/auth.middleware';
import { requireRole } from '@/middlewares/require-role.middleware';
import { asyncHandler } from '@/shared/services/async-handler.service';

import * as controller from './fiscal.controller';

const router = Router();

const adminOnly = [authenticate, requireRole(Role.ADMIN)];

/**
 * @openapi
 * components:
 *   schemas:
 *     FiscalReceiptAdmin:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         paymentId:
 *           type: string
 *           format: uuid
 *         refundId:
 *           type: string
 *           format: uuid
 *           nullable: true
 *           description: Set only for a SALE_RETURN — the appointment refund it records
 *         userId:
 *           type: string
 *           format: uuid
 *         operationType:
 *           type: string
 *           enum: [SALE, SALE_RETURN]
 *         status:
 *           type: string
 *           enum: [PENDING, ISSUED, FAILED]
 *         externalCheckNumber:
 *           type: string
 *           description: Webkassa idempotency key — Payment.id for a sale, AppointmentRefund.id for a return
 *         amount:
 *           type: number
 *           example: 15000
 *         cashboxUniqueNumber:
 *           type: string
 *           example: SWK00035676
 *         checkNumber:
 *           type: string
 *           nullable: true
 *           description: Fiscal sign (CheckNumber)
 *         registrationNumber:
 *           type: string
 *           nullable: true
 *         checkOrderNumber:
 *           type: integer
 *           nullable: true
 *         shiftNumber:
 *           type: integer
 *           nullable: true
 *         offlineMode:
 *           type: boolean
 *           nullable: true
 *         fiscalizedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         ticketUrl:
 *           type: string
 *           nullable: true
 *           description: OFD link (QR)
 *         ticketPrintUrl:
 *           type: string
 *           nullable: true
 *           description: Webkassa printable form
 *         attempts:
 *           type: integer
 *         retryRound:
 *           type: integer
 *         lastErrorCode:
 *           type: integer
 *           nullable: true
 *         lastError:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         purpose:
 *           type: string
 *           enum: [BALANCE_TOPUP, APPOINTMENT, PAID_PROGRAM, MED_ACCOUNT_TOPUP]
 *         pgPaymentId:
 *           type: string
 *           nullable: true
 *         patientName:
 *           type: string
 *           nullable: true
 *         patientIin:
 *           type: string
 *           nullable: true
 *         patientPhone:
 *           type: string
 * /fiscal/admin/receipts:
 *   get:
 *     summary: Fiscal receipt queue (Admin only)
 *     description: >
 *       Paginated Webkassa receipts with the summed amount of the filtered set. Day filters
 *       are cashbox days (Asia/Almaty). `search` matches the patient's name, IIN or phone, the
 *       payment id, the FreedomPay `pgPaymentId` and the fiscal `checkNumber`.
 *     tags: [Fiscal]
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
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [PENDING, ISSUED, FAILED]
 *       - name: operationType
 *         in: query
 *         schema:
 *           type: string
 *           enum: [SALE, SALE_RETURN]
 *       - name: dateFrom
 *         in: query
 *         schema:
 *           type: string
 *           example: "2026-10-01"
 *       - name: dateTo
 *         in: query
 *         schema:
 *           type: string
 *           example: "2026-10-31"
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Receipts
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
 *                     $ref: '#/components/schemas/FiscalReceiptAdmin'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *                 totalAmount:
 *                   type: number
 *       400:
 *         description: Invalid filter
 *       403:
 *         description: Forbidden — admin role required
 */
router.get('/admin/receipts', ...adminOnly, asyncHandler(controller.getAdminReceipts));

/**
 * @openapi
 * /fiscal/admin/receipts/{id}:
 *   get:
 *     summary: One fiscal receipt, with the positions sent to Webkassa (Admin only)
 *     tags: [Fiscal]
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
 *         description: The receipt; `receipt.positions` holds Positions/Payments as sent, without buyer contacts
 *       403:
 *         description: Forbidden — admin role required
 *       404:
 *         description: FISCAL_RECEIPT_NOT_FOUND
 */
router.get('/admin/receipts/:id', ...adminOnly, asyncHandler(controller.getAdminReceipt));

/**
 * @openapi
 * /fiscal/admin/receipts/{id}/retry:
 *   post:
 *     summary: Re-send a FAILED receipt to Webkassa (Admin only)
 *     description: >
 *       Moves the receipt back to PENDING with the attempt counter reset and queues it again.
 *       Safe to repeat against Webkassa — the ExternalCheckNumber is the idempotency key, so a
 *       receipt that did register returns its existing details.
 *     tags: [Fiscal]
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
 *         description: The receipt, now PENDING
 *       403:
 *         description: Forbidden — admin role required
 *       404:
 *         description: FISCAL_RECEIPT_NOT_FOUND
 *       409:
 *         description: FISCAL_RECEIPT_NOT_RETRYABLE — only a FAILED receipt can be retried
 */
router.post('/admin/receipts/:id/retry', ...adminOnly, asyncHandler(controller.retryReceipt));

/**
 * @openapi
 * /fiscal/admin/shift/close:
 *   post:
 *     summary: Close the Webkassa shift now (Z-report) (Admin only)
 *     description: >
 *       Runs through the same queue as receipts (Webkassa requires strictly sequential
 *       requests per cash register) and waits up to 30 s for the result. No open shift is not
 *       an error — it answers `closed: false`.
 *     tags: [Fiscal]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Z-report result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 closed:
 *                   type: boolean
 *                 shiftNumber:
 *                   type: integer
 *                   nullable: true
 *       403:
 *         description: Forbidden — admin role required
 *       409:
 *         description: WEBKASSA_DISABLED — the switch is off or the configuration is incomplete
 *       502:
 *         description: WEBKASSA_UNAVAILABLE — Webkassa did not answer
 */
router.post('/admin/shift/close', ...adminOnly, asyncHandler(controller.closeShift));

export default router;
