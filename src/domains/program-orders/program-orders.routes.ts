import { Router } from 'express';

import { Role } from '@prisma/client';

import { authenticate } from '@/middlewares/auth.middleware';
import { requireRole } from '@/middlewares/require-role.middleware';
import { asyncHandler } from '@/shared/services/async-handler.service';

import * as controller from './program-orders.controller';

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     ProgramOrderItem:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         category:
 *           type: string
 *           enum: [MED_PLAN, CHECKUP]
 *         externalId:
 *           type: string
 *           description: MIS `oid` for a med plan, `Checkup.id` for a check-up
 *         code:
 *           type: string
 *           nullable: true
 *           example: "thyroid"
 *         title:
 *           type: string
 *         price:
 *           type: number
 *           description: Price in tenge at purchase time
 *     ProgramOrder:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         status:
 *           type: string
 *           enum: [NEW, IN_PROGRESS, COMPLETED, CANCELLED]
 *         total:
 *           type: number
 *         contactPhone:
 *           type: string
 *           nullable: true
 *         comment:
 *           type: string
 *           nullable: true
 *         paymentId:
 *           type: string
 *           format: uuid
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ProgramOrderItem'
 *     ProgramOrderAdminItem:
 *       allOf:
 *         - $ref: '#/components/schemas/ProgramOrder'
 *         - type: object
 *           properties:
 *             userId:
 *               type: string
 *               format: uuid
 *             patientName:
 *               type: string
 *               nullable: true
 *             patientIin:
 *               type: string
 *               nullable: true
 *             patientPhone:
 *               type: string
 */

/**
 * @openapi
 * /program-orders:
 *   get:
 *     summary: Paid-program orders placed by the authenticated user
 *     description: |
 *       Orders ("заявки") created from the paid-programs cart, newest first. An order only
 *       exists once the payment behind it settled as SUCCESS — a cart that was never paid
 *       for has no order, only a PENDING payment (see `GET /payment/pending`).
 *     tags: [ProgramOrders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Orders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 orders:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ProgramOrder'
 *       401:
 *         description: Unauthorized
 */
router.get('/', authenticate, asyncHandler(controller.getMyOrders));

/**
 * @openapi
 * /program-orders/admin:
 *   get:
 *     summary: Paid-program orders across all patients (dashboard)
 *     tags: [ProgramOrders]
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
 *         description: Matches patient phone, full name, IIN, or a program title in the order
 *         schema:
 *           type: string
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [NEW, IN_PROGRESS, COMPLETED, CANCELLED]
 *       - name: category
 *         in: query
 *         description: Only orders containing a program from this catalogue
 *         schema:
 *           type: string
 *           enum: [MED_PLAN, CHECKUP]
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
 *         description: Paginated orders plus the summed total of the filtered set
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
 *                     $ref: '#/components/schemas/ProgramOrderAdminItem'
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
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not an admin
 */
router.get(
  '/admin',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(controller.getAdminOrders)
);

/**
 * @openapi
 * /program-orders/admin/{id}:
 *   get:
 *     summary: One order, unscoped (dashboard)
 *     tags: [ProgramOrders]
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
 *         description: Order
 *       403:
 *         description: Not an admin
 *       404:
 *         description: Order not found
 *   patch:
 *     summary: Move an order along or leave an operator note (dashboard)
 *     description: Partial update — only the keys sent are written. Amounts and items are immutable.
 *     tags: [ProgramOrders]
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
 *                 enum: [NEW, IN_PROGRESS, COMPLETED, CANCELLED]
 *               comment:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Updated order
 *       400:
 *         description: Invalid payload
 *       403:
 *         description: Not an admin
 *       404:
 *         description: Order not found
 */
router.get(
  '/admin/:id',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(controller.getAdminOrder)
);
router.patch(
  '/admin/:id',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(controller.updateAdminOrder)
);

/**
 * @openapi
 * /program-orders/{id}:
 *   get:
 *     summary: One of the authenticated user's orders
 *     tags: [ProgramOrders]
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
 *         description: Order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 order:
 *                   $ref: '#/components/schemas/ProgramOrder'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Order not found
 */
// Registered last so `/admin` is matched by its own handler rather than swallowed here.
router.get('/:id', authenticate, asyncHandler(controller.getMyOrder));

export default router;
