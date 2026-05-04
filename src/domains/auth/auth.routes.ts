import { Router } from 'express';

import { authenticate } from '@/middlewares/auth.middleware';

import * as controller from './auth.controller';

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     RequestOTPBody:
 *       type: object
 *       required:
 *         - phone
 *       properties:
 *         phone:
 *           type: string
 *           description: Phone number starting with 7 followed by 10 digits. Ignored if `iin` is supplied and resolves to a phone in the insurance service.
 *           example: "77771400962"
 *         iin:
 *           type: string
 *           description: Optional 12-digit IIN. When supplied, the authoritative phone is fetched from the insurance service and the local user's phone is synced if it has changed.
 *           example: "630301350211"
 *     RequestOTPResponse:
 *        type: object
 *        properties:
 *          id:
 *            type: string
 *            format: uuid
 *            description: User ID
 *          phone:
 *            type: string
 *            description: Phone number
 * /auth/request-otp:
 *   post:
 *     summary: Request OTP code for phone verification
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *              $ref: '#/components/schemas/RequestOTPBody'
 *     responses:
 *       200:
 *         description: OTP code generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RequestOTPResponse'
 *       400:
 *         description: Invalid phone number format
 */
router.post('/request-otp', controller.requestOtp);

/**
 * @openapi
 * components:
 *   schemas:
 *     VerifyOTPBody:
 *       type: object
 *       required:
 *         - phone
 *         - otp
 *       properties:
 *         phone:
 *           type: string
 *           description: User's phone number starting with 7 followed by 10 digits
 *           example: "77051234567"
 *         otp:
 *           type: string
 *           description: OTP code received by the user
 *           example: "1234"
 *     VerifyOTPResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         accessToken:
 *           type: string
 *           description: JWT access token
 *         refreshToken:
 *           type: string
 *           description: JWT refresh token
 * /auth/verify-otp:
 *   post:
 *     summary: Verify OTP code and get authentication tokens
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerifyOTPBody'
 *     responses:
 *       200:
 *         description: OTP verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VerifyOTPResponse'
 *       404:
 *         description: User not found
 *       400:
 *         description: Invalid or expired OTP
 */
router.post('/verify-otp', controller.verifyOtp);

/**
 * @openapi
 * components:
 *   schemas:
 *     ChangePhoneBody:
 *       type: object
 *       required:
 *         - phone
 *       properties:
 *         phone:
 *           type: string
 *           description: New phone number starting with 7 followed by 10 digits
 *           example: "77051234567"
 *     ChangePhoneResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         user:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             phone:
 *               type: string
 *             role:
 *               type: string
 * /auth/change-phone:
 *   post:
 *     summary: Update authenticated user's phone number
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChangePhoneBody'
 *     responses:
 *       200:
 *         description: Phone updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChangePhoneResponse'
 *       400:
 *         description: Invalid phone or already in use
 *       401:
 *         description: Unauthorized
 */
router.post('/change-phone', authenticate, controller.changePhone);

router.post('/create-demo-account', controller.createDemoAccount);

export default router;
