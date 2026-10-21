import { Router } from 'express';

import { Role } from '@prisma/client';

import { authenticate } from '@/middlewares/auth.middleware';
import { requireRole } from '@/middlewares/require-role.middleware';

import * as controller from './audit.controller';

const router = Router();

/**
 * @openapi
 * /audit/admin/auth-attempts:
 *   get:
 *     summary: Sign-in and registration attempts (dashboard, admin only)
 *     description: >
 *       Audit entries for OTP requests, logins, failed attempts, PIN checks and account
 *       creation, newest first. A failed attempt carries `metadata.flow`, `metadata.step`,
 *       `metadata.reason` and, when an upstream service caused it, `metadata.upstream`.
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         description: A full phone number (any format) or a 12-digit IIN
 *         schema:
 *           type: string
 *       - in: query
 *         name: success
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *     responses:
 *       200:
 *         description: A page of attempts
 *       400:
 *         description: The search is neither a full phone nor an IIN (INVALID_AUTH_ATTEMPT_SEARCH)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Authenticated, but not an admin
 */
router.get('/admin/auth-attempts', authenticate, requireRole(Role.ADMIN), controller.getAuthAttempts);

/**
 * @openapi
 * /audit/admin/logs:
 *   get:
 *     summary: Backend log lines (dashboard, admin only)
 *     description: >
 *       Lines kept in the AppLog table for LOG_RETENTION_DAYS, newest first. `search` takes a
 *       full phone or IIN (resolved to that person's account and sign-in attempts), a request
 *       or user id, or text matched against URLs and messages. `reqId` returns one request's
 *       lines in order. Page with `before` = the previous response's `nextCursor`.
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: reqId, schema: { type: string } }
 *       - { in: query, name: level, schema: { type: string, enum: [warn, error] } }
 *       - { in: query, name: from, schema: { type: string, format: date-time } }
 *       - { in: query, name: to, schema: { type: string, format: date-time } }
 *       - { in: query, name: before, schema: { type: string } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 200 } }
 *     responses:
 *       200:
 *         description: A page of log lines and the cursor for the next one
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Authenticated, but not an admin
 */
router.get('/admin/logs', authenticate, requireRole(Role.ADMIN), controller.getAppLogs);

export default router;
