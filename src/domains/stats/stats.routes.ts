import { Router } from 'express';

import { Role } from '@prisma/client';

import { authenticate } from '@/middlewares/auth.middleware';
import { requireRole } from '@/middlewares/require-role.middleware';

import * as controller from './stats.controller';

const router = Router();

/**
 * @openapi
 * /stats/overview:
 *   get:
 *     summary: Platform-wide counters for the dashboard overview (admin only)
 *     tags: [Stats]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Counters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 totalPatients:
 *                   type: integer
 *                 totalRefundRequests:
 *                   type: integer
 *                 acceptedRefunds:
 *                   type: integer
 *                 totalAppointments:
 *                   type: integer
 *                 appointmentsToday:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Authenticated, but not an admin
 */
router.get('/overview', authenticate, requireRole(Role.ADMIN), controller.getOverview);

export default router;
