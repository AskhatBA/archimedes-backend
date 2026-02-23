import { Router } from 'express';

import { authenticate } from '@/middlewares/auth.middleware';

import * as controller from './notifications.controller';

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     RegisterDeviceBody:
 *       type: object
 *       required:
 *         - deviceId
 *         - platform
 *       properties:
 *         deviceId:
 *           type: string
 *           description: Unique device identifier (OneSignal player ID or FCM token)
 *           example: "abc123-def456-ghi789"
 *         platform:
 *           type: string
 *           enum: [IOS, ANDROID, WEB]
 *           description: Device platform
 *           example: "IOS"
 *     RegisterDeviceResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               format: uuid
 *             userId:
 *               type: string
 *               format: uuid
 *             deviceId:
 *               type: string
 *             platform:
 *               type: string
 *               enum: [IOS, ANDROID, WEB]
 *             createdAt:
 *               type: string
 *               format: date-time
 *     DeviceListResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 format: uuid
 *               deviceId:
 *                 type: string
 *               platform:
 *                 type: string
 *                 enum: [IOS, ANDROID, WEB]
 *               createdAt:
 *                 type: string
 *                 format: date-time
 *     SendNotificationBody:
 *       type: object
 *       required:
 *         - message
 *       properties:
 *         userId:
 *           type: string
 *           format: uuid
 *           description: Target user ID
 *         title:
 *           type: string
 *           description: Notification title
 *           example: "New Appointment"
 *         message:
 *           type: string
 *           description: Notification message
 *           example: "You have a new appointment scheduled"
 *         data:
 *           type: object
 *           description: Additional data payload
 *           additionalProperties: true
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 * /notifications/devices:
 *   post:
 *     summary: Register a device for push notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterDeviceBody'
 *     responses:
 *       201:
 *         description: Device registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RegisterDeviceResponse'
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 *   get:
 *     summary: Get all registered devices for the authenticated user
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of registered devices
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeviceListResponse'
 *       401:
 *         description: Unauthorized
 * /notifications/devices/{deviceId}:
 *   delete:
 *     summary: Unregister a device from push notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Device ID to unregister
 *     responses:
 *       200:
 *         description: Device unregistered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Invalid device ID
 *       401:
 *         description: Unauthorized
 * /notifications/send:
 *   post:
 *     summary: Send a push notification to a user
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SendNotificationBody'
 *     responses:
 *       200:
 *         description: Notification sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 */

router.post('/devices', authenticate, controller.registerDevice);
router.get('/devices', authenticate, controller.getUserDevices);
router.delete('/devices/:deviceId', authenticate, controller.unregisterDevice);
router.post('/send', authenticate, controller.sendNotification);

export default router;
