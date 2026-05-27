import { Router } from 'express';

import { authenticate } from '@/middlewares/auth.middleware';

import * as controller from './user.controller';

const router = Router();

router.get('/patient/profile', authenticate, controller.getUserProfile);

/**
 * @openapi
 * /user/check-account:
 *   get:
 *     summary: Check if a patient account exists in DB, MIS, and Insurance service
 *     tags: [User]
 *     parameters:
 *       - name: iin
 *         in: query
 *         description: 12-digit IIN
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 12
 *           maxLength: 12
 *       - name: phone
 *         in: query
 *         description: Phone number (optional, improves DB and MIS lookup)
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Account check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 existsInDb:
 *                   type: boolean
 *                 existsInMis:
 *                   type: boolean
 *                 existsInInsurance:
 *                   type: boolean
 *                 isPhoneMatch:
 *                   type: boolean
 *                   description: True if the provided phone matches the phone returned by the Insurance service for the given IIN
 *       400:
 *         description: Invalid input
 */
router.get('/check-account', controller.checkAccount);

export default router;
