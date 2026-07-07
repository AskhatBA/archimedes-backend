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

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Invalidate the current session by clearing the refresh token
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: Unauthorized
 */
router.post('/logout', authenticate, controller.logout);

/**
 * @openapi
 * components:
 *   schemas:
 *     RefreshBody:
 *       type: object
 *       required:
 *         - refreshToken
 *       properties:
 *         refreshToken:
 *           type: string
 *           description: The refresh token stored in the device's secure storage, released after biometric unlock.
 *     RefreshResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         accessToken:
 *           type: string
 *           description: New 15-minute access token
 *         refreshToken:
 *           type: string
 *           description: New refresh token (the previous one is rotated out and revoked)
 * /auth/refresh:
 *   post:
 *     summary: Exchange a refresh token for a fresh 15-minute access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshBody'
 *     responses:
 *       200:
 *         description: Session refreshed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RefreshResponse'
 *       401:
 *         description: Invalid, expired, revoked, or superseded refresh token
 */
router.post('/refresh', controller.refresh);

/**
 * @openapi
 * components:
 *   schemas:
 *     SetPinBody:
 *       type: object
 *       required:
 *         - pin
 *       properties:
 *         pin:
 *           type: string
 *           description: 4-6 digit PIN. Trivial PINs (repeated or sequential digits) are rejected.
 *           example: "8302"
 * /auth/pin:
 *   post:
 *     summary: Set or replace the authenticated user's PIN
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SetPinBody'
 *     responses:
 *       200:
 *         description: PIN saved
 *       400:
 *         description: Invalid PIN format
 *       401:
 *         description: Unauthorized
 */
router.post('/pin', authenticate, controller.setPin);

/**
 * @openapi
 * components:
 *   schemas:
 *     VerifyPinBody:
 *       type: object
 *       required:
 *         - phone
 *         - pin
 *       properties:
 *         phone:
 *           type: string
 *           example: "77771400962"
 *         pin:
 *           type: string
 *           example: "8302"
 * /auth/pin/verify:
 *   post:
 *     summary: Verify a PIN (biometric fallback) and get a fresh session
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerifyPinBody'
 *     responses:
 *       200:
 *         description: PIN verified; new tokens issued
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RefreshResponse'
 *       400:
 *         description: Invalid PIN or PIN not set
 *       429:
 *         description: Too many failed attempts; PIN temporarily locked
 */
router.post('/pin/verify', controller.verifyPin);

/**
 * @openapi
 * components:
 *   schemas:
 *     SetBiometricBody:
 *       type: object
 *       required:
 *         - enabled
 *       properties:
 *         enabled:
 *           type: boolean
 *           description: Whether biometric login is enabled for this account.
 * /auth/biometric:
 *   post:
 *     summary: Enable or disable biometric login for the authenticated user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SetBiometricBody'
 *     responses:
 *       200:
 *         description: Biometric preference updated
 *       401:
 *         description: Unauthorized
 */
router.post('/biometric', authenticate, controller.setBiometric);

export default router;
