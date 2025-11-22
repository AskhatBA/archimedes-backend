import { Router } from 'express';

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
 *           description: Phone number starting with 7 followed by 10 digits
 *           example: "77771400962"
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

router.post('/create-demo-account', controller.createDemoAccount);

export default router;
