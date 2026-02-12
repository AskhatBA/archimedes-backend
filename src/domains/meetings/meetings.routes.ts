import { Router } from 'express';

import { authenticate } from '@/middlewares/auth.middleware';

import * as controller from './meetings.controller';

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     CreateMeetingBody:
 *       type: object
 *       required: [topic, start_time, duration]
 *       properties:
 *         topic:
 *           type: string
 *           example: "Patient Consultation"
 *         start_time:
 *           type: string
 *           format: date-time
 *           description: ISO 8601 date-time in UTC
 *           example: "2026-02-10T10:00:00Z"
 *         duration:
 *           type: integer
 *           description: Meeting duration in minutes
 *           example: 30
 *     MeetingResponse:
 *       type: object
 *       properties:
 *         meetingId:
 *           type: string
 *           example: "123456789"
 *         joinUrl:
 *           type: string
 *           example: "https://zoom.us/j/123456789"
 *         startUrl:
 *           type: string
 *           example: "https://zoom.us/s/123456789"
 *     RecordingFile:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         fileType:
 *           type: string
 *           example: "MP4"
 *         fileSize:
 *           type: number
 *           example: 52428800
 *         downloadUrl:
 *           type: string
 *           example: "https://zoom.us/rec/download/..."
 *         recordingType:
 *           type: string
 *           example: "shared_screen_with_speaker_view"
 *     RecordingResponse:
 *       type: object
 *       properties:
 *         meetingId:
 *           type: string
 *           example: "123456789"
 *         topic:
 *           type: string
 *           example: "Patient Consultation"
 *         startTime:
 *           type: string
 *           format: date-time
 *         duration:
 *           type: number
 *           example: 30
 *         files:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/RecordingFile'
 * /meetings:
 *   post:
 *     summary: Create a Zoom meeting
 *     tags: [Meetings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateMeetingBody'
 *     responses:
 *       200:
 *         description: Meeting created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 meeting:
 *                   $ref: '#/components/schemas/MeetingResponse'
 *       400:
 *         description: Bad Request - Invalid input
 *       401:
 *         description: Unauthorized
 * /meetings/{meetingId}/recordings:
 *   get:
 *     summary: Get recordings for a Zoom meeting
 *     tags: [Meetings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meetingId
 *         required: true
 *         schema:
 *           type: string
 *         description: The Zoom meeting ID
 *     responses:
 *       200:
 *         description: Recordings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 recordings:
 *                   $ref: '#/components/schemas/RecordingResponse'
 *       400:
 *         description: Bad Request - Invalid meeting ID
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Recording not found
 */
router.post('/', authenticate, controller.createMeeting);
router.get('/:meetingId/recordings', authenticate, controller.getMeetingRecordings);

export default router;
