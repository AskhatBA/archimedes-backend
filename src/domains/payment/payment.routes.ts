import { Router } from 'express';

import { authenticate } from '@/middlewares/auth.middleware';

import * as controller from './payment.controller';

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     InitPaymentBody:
 *       type: object
 *       required:
 *         - amount
 *       properties:
 *         amount:
 *           type: number
 *           description: Payment amount in KZT (must be greater than 0)
 *           example: 5000
 *         description:
 *           type: string
 *           description: Payment description shown to the payer
 *           example: Balance replenishment
 *     InitPaymentResponse:
 *       type: object
 *       properties:
 *         paymentId:
 *           type: string
 *           format: uuid
 *           description: Internal payment record ID
 *         paymentUrl:
 *           type: string
 *           description: FreedomPay redirect URL to open in the payment WebView
 *     Payment:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         amount:
 *           type: number
 *         description:
 *           type: string
 *         status:
 *           type: string
 *           enum: [PENDING, SUCCESS, FAILED]
 *         pgPaymentId:
 *           type: string
 *           nullable: true
 *           description: FreedomPay transaction ID
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @openapi
 * /payment/init:
 *   post:
 *     summary: Initiate a balance replenishment payment
 *     description: Creates a payment record and returns the FreedomPay redirect URL. Open this URL in a WebView to let the user complete the payment.
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/InitPaymentBody'
 *     responses:
 *       200:
 *         description: Payment initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InitPaymentResponse'
 *       400:
 *         description: Invalid amount
 *       401:
 *         description: Unauthorized
 *       502:
 *         description: FreedomPay rejected the payment request
 */
router.post('/init', authenticate, controller.initPayment);

/**
 * @openapi
 * /payment/callback:
 *   post:
 *     summary: FreedomPay server-to-server result callback (pg_result_url)
 *     description: |
 *       Called by FreedomPay after a payment is processed. Must stay public and unauthenticated.
 *
 *       Verifies the request signature and the settled amount, then moves the payment out of
 *       PENDING exactly once and credits the user's balance on success. Repeated deliveries of
 *       the same result are ignored, so the balance is never credited twice.
 *
 *       Always answers 200 with a signed XML body — outcomes are reported in `pg_status`
 *       (`ok` / `rejected` / `error`), because a non-200 makes FreedomPay retry the callback
 *       every 30 minutes for 2 hours.
 *     tags: [Payment]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               pg_order_id:
 *                 type: string
 *                 format: uuid
 *                 description: Internal payment ID passed as pg_order_id on init
 *               pg_payment_id:
 *                 type: string
 *                 description: FreedomPay transaction ID
 *               pg_result:
 *                 type: string
 *                 enum: ['0', '1', '2']
 *                 description: 1 - success, 0 - failure, 2 - not completed yet (stays PENDING)
 *               pg_amount:
 *                 type: string
 *                 description: Settled amount; must match the initiated amount
 *               pg_currency:
 *                 type: string
 *               pg_payment_date:
 *                 type: string
 *               pg_salt:
 *                 type: string
 *               pg_sig:
 *                 type: string
 *     responses:
 *       200:
 *         description: Signed XML acknowledgement
 *         content:
 *           application/xml:
 *             schema:
 *               type: string
 */
router.post('/callback', controller.handleCallback);

/**
 * @openapi
 * /payment/success:
 *   get:
 *     summary: Payment success redirect target
 *     description: FreedomPay redirects the user here after a successful payment. The WebView detects this URL and closes.
 *     tags: [Payment]
 *     responses:
 *       200:
 *         description: Payment success indicator
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 */
router.get('/success', controller.paymentSuccess);

/**
 * @openapi
 * /payment/failure:
 *   get:
 *     summary: Payment failure redirect target
 *     description: FreedomPay redirects the user here after a failed or cancelled payment. The WebView detects this URL and closes.
 *     tags: [Payment]
 *     responses:
 *       200:
 *         description: Payment failure indicator
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: failed
 */
router.get('/failure', controller.paymentFailure);

/**
 * @openapi
 * /payment/balance:
 *   get:
 *     summary: Get the authenticated user's balance
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current balance in KZT
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 balance:
 *                   type: number
 *                   example: 15000
 *       401:
 *         description: Unauthorized
 */
router.get('/balance', authenticate, controller.getBalance);

/**
 * @openapi
 * /payment/history:
 *   get:
 *     summary: Get payment history for the authenticated user
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of payments ordered by date descending
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Payment'
 *       401:
 *         description: Unauthorized
 */
router.get('/history', authenticate, controller.getPaymentHistory);

/**
 * @openapi
 * /payment/status/{id}:
 *   get:
 *     summary: Get a single payment by ID
 *     description: |
 *       Returns the payment record. If the payment is still PENDING more than a minute after
 *       creation, its state is re-checked against FreedomPay first — this settles payments whose
 *       result callback never arrived. Poll this endpoint after the WebView closes.
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Internal payment ID returned by /payment/init
 *     responses:
 *       200:
 *         description: Payment record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Payment'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Payment not found
 */
router.get('/status/:id', authenticate, controller.getPaymentStatus);

export default router;
