import { Router } from 'express';

import { Role } from '@prisma/client';

import { authenticate } from '@/middlewares/auth.middleware';
import { requireRole } from '@/middlewares/require-role.middleware';
import { asyncHandler } from '@/shared/services/async-handler.service';

import * as controller from './checkups.controller';

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     CheckupItem:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         code:
 *           type: string
 *           example: "thyroid"
 *         title:
 *           type: string
 *           example: "Чек-ап «Щитовидка без сюрпризов»"
 *         description:
 *           type: string
 *           nullable: true
 *         price:
 *           type: number
 *           description: Price in tenge
 *           example: 25300
 *         duration:
 *           type: string
 *           nullable: true
 *           example: "1 день"
 *         coverage:
 *           type: string
 *           enum: [PERSONAL, FAMILY]
 *         services:
 *           type: array
 *           items:
 *             type: string
 *         popular:
 *           type: boolean
 *     CheckupAdminItem:
 *       allOf:
 *         - $ref: '#/components/schemas/CheckupItem'
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
 *     CheckupWriteBody:
 *       type: object
 *       required: [code, title, price, services]
 *       properties:
 *         code:
 *           type: string
 *           description: Lowercase slug, unique across the catalogue
 *           example: "womens-health"
 *         title:
 *           type: string
 *           example: "Чек-ап «Женское здоровье»"
 *         price:
 *           type: number
 *           description: Price in tenge
 *           example: 20100
 *         services:
 *           type: array
 *           minItems: 1
 *           items:
 *             type: string
 *         description:
 *           type: string
 *           nullable: true
 *         duration:
 *           type: string
 *           nullable: true
 *           example: "1 день"
 *         coverage:
 *           type: string
 *           enum: [PERSONAL, FAMILY]
 *         popular:
 *           type: boolean
 *         isActive:
 *           type: boolean
 *         sortOrder:
 *           type: number
 * /checkups:
 *   get:
 *     summary: Get the active check-up catalogue
 *     tags: [Checkups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Check-up catalogue
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 checkups:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CheckupItem'
 *       401:
 *         description: Unauthorized
 */
router.get('/', authenticate, asyncHandler(controller.getCheckups));

/**
 * @openapi
 * /checkups/admin:
 *   get:
 *     summary: Get the whole catalogue, including unpublished entries (Admin only)
 *     tags: [Checkups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Check-up catalogue
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 checkups:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CheckupAdminItem'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin role required
 *   post:
 *     summary: Create a check-up (Admin only)
 *     tags: [Checkups]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CheckupWriteBody'
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 checkup:
 *                   $ref: '#/components/schemas/CheckupAdminItem'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin role required
 *       409:
 *         description: A check-up with this code already exists
 */
router.get(
  '/admin',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(controller.getAdminCheckups)
);
router.post(
  '/admin',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(controller.createCheckup)
);

/**
 * @openapi
 * /checkups/admin/{id}:
 *   patch:
 *     summary: Update a check-up (Admin only)
 *     tags: [Checkups]
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
 *             $ref: '#/components/schemas/CheckupWriteBody'
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 checkup:
 *                   $ref: '#/components/schemas/CheckupAdminItem'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin role required
 *       404:
 *         description: Check-up not found
 *       409:
 *         description: A check-up with this code already exists
 *   delete:
 *     summary: Delete a check-up (Admin only)
 *     tags: [Checkups]
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 checkup:
 *                   $ref: '#/components/schemas/CheckupAdminItem'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin role required
 *       404:
 *         description: Check-up not found
 */
router.patch(
  '/admin/:id',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(controller.updateCheckup)
);
router.delete(
  '/admin/:id',
  authenticate,
  requireRole(Role.ADMIN),
  asyncHandler(controller.deleteCheckup)
);

/**
 * @openapi
 * /checkups/{id}:
 *   get:
 *     summary: Get one check-up by id or code
 *     tags: [Checkups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Check-up uuid or its stable code
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Check-up
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 checkup:
 *                   $ref: '#/components/schemas/CheckupItem'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Check-up not found
 */
// Registered last so `/admin` is matched by its own handler rather than swallowed here.
router.get('/:id', authenticate, asyncHandler(controller.getCheckup));

export default router;
