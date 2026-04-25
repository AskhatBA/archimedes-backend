import { Router } from 'express';

import { authenticate } from '@/middlewares/auth.middleware';

import * as controller from './app-version.controller';

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     AppVersionResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         latestVersion:
 *           type: string
 *           example: "2.4.0"
 *         minSupportedVersion:
 *           type: string
 *           example: "2.0.0"
 *         forceUpdate:
 *           type: boolean
 *           example: false
 *         iosUrl:
 *           type: string
 *           example: "https://apps.apple.com/app/id123456789"
 *         androidUrl:
 *           type: string
 *           example: "https://play.google.com/store/apps/details?id=com.example.app"
 *         changelog:
 *           type: string
 *           nullable: true
 *           example: "Bug fixes and performance improvements"
 *     CreateAppVersionBody:
 *       type: object
 *       required: [platform, latestVersion, minSupportedVersion, forceUpdate]
 *       properties:
 *         platform:
 *           type: string
 *           enum: [ios, android, all]
 *           example: "all"
 *         latestVersion:
 *           type: string
 *           example: "2.4.0"
 *         minSupportedVersion:
 *           type: string
 *           example: "2.0.0"
 *         forceUpdate:
 *           type: boolean
 *           example: false
 *         changelog:
 *           type: string
 *           example: "Bug fixes and performance improvements"
 *     CreateAppVersionResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         appVersion:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               format: uuid
 *             platform:
 *               type: string
 *               enum: [IOS, ANDROID, ALL]
 *             latestVersion:
 *               type: string
 *             minSupportedVersion:
 *               type: string
 *             forceUpdate:
 *               type: boolean
 *             changelog:
 *               type: string
 *               nullable: true
 *             createdAt:
 *               type: string
 *               format: date-time
 * /app/version:
 *   get:
 *     summary: Get latest app version configuration
 *     tags: [App Version]
 *     parameters:
 *       - name: platform
 *         in: query
 *         required: false
 *         description: Filter by platform
 *         schema:
 *           type: string
 *           enum: [ios, android]
 *     responses:
 *       200:
 *         description: Version configuration
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AppVersionResponse'
 *       400:
 *         description: Invalid platform parameter
 *       404:
 *         description: No version configuration found
 *   post:
 *     summary: Create a new app version config (Admin only)
 *     tags: [App Version]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateAppVersionBody'
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateAppVersionResponse'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin role required
 */
router.get('/version', controller.getVersion);
router.post('/version', authenticate, controller.createVersion);

export default router;
