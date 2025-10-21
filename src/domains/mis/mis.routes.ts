import { Router } from 'express';

import { authenticate } from '@/middlewares/auth.middleware';

import * as controller from './mis.controller';

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     MISPatient:
 *       type: object
 *       required:
 *         - id
 *         - firstName
 *         - lastName
 *         - birthDate
 *         - gender
 *         - iin
 *       properties:
 *         id:
 *           type: string
 *         firstName:
 *           type: string
 *         lastName:
 *           type: string
 *         patronymic:
 *           type: string
 *         birthDate:
 *           type: string
 *           format: date
 *         gender:
 *           type: string
 *           enum: [M, F]
 *         iin:
 *           type: string
 * /mis/find-patient:
 *   get:
 *     summary: Find patient by phone number
 *     tags: [MIS]
 *     parameters:
 *       - name: iin
 *         in: query
 *         description: Individual Identification Number
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Patient found successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 patient:
 *                   $ref: '#/components/schemas/MISPatient'
 *       401:
 *         description: User not found or unauthorized
 */
router.get('/find-patient', authenticate, controller.findPatient);

/**
 * @openapi
 * components:
 *   schemas:
 *     CreateMISPatientBody:
 *       type: object
 *       required:
 *         - phoneNumber
 *         - firstName
 *         - lastName
 *         - gender
 *         - birthDate
 *         - iin
 *       properties:
 *         phoneNumber:
 *           type: string
 *           example: "77771234567"
 *         firstName:
 *           type: string
 *           example: "John"
 *         lastName:
 *           type: string
 *           example: "Doe"
 *         patronymic:
 *           type: string
 *           example: "Smith"
 *         gender:
 *           type: string
 *           enum: [M, F]
 *           example: "M"
 *         birthDate:
 *           type: string
 *           format: date
 *           example: "1990-01-01"
 *         iin:
 *           type: string
 *           example: "123456789012"
 *     CreateMISPatientResponse:
 *       type: object
 *       required:
 *         - phoneNumber
 *         - firstName
 *         - lastName
 *         - gender
 *         - birthDate
 *         - iin
 *       properties:
 *         id:
 *           type: string
 *           example: "7f5a8b13-74e8-4c25-9ac5-bc2df1cf9f64"
 *         name:
 *           type: string
 *           example: "John Doe"
 *         gender:
 *           type: number
 *           example: 0
 *         iin:
 *           type: string
 *           example: "999999999999"
 *         phone_number:
 *           type: string
 *           example: "87771112233"
 *         address:
 *           type: string
 *           example: "Street, something"
 *         address_details:
 *           type: string
 *           example: "Street, something"
 * /mis/create-patient:
 *   post:
 *     summary: Create a new patient
 *     tags: [MIS]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateMISPatientBody'
 *     responses:
 *       200:
 *         description: Patient created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 description:
 *                   type: string
 *                   example: Patient created
 *                 patient:
 *                   $ref: '#/components/schemas/CreateMISPatientResponse'
 *       401:
 *         description: User not found or unauthorized
 */
router.post('/create-patient', authenticate, controller.createPatient);

/**
 * @openapi
 * components:
 *   schemas:
 *     MISBranch:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         address:
 *           type: string
 * /mis/branches:
 *   get:
 *     summary: Get medical branches from MIS
 *     tags: [MIS]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Branches fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 branches:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MISBranch'
 *       401:
 *         description: User not found or unauthorized
 */
router.get('/branches', authenticate, controller.getBranches);

/**
 * @openapi
 * components:
 *   schemas:
 *     MISSpecialization:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 * /mis/specializations:
 *   get:
 *     summary: Get medical specializations from MIS
 *     tags: [MIS]
 *     parameters:
 *       - name: branchId
 *         in: query
 *         description: Branch ID from MIS
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Specializations fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 specializations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MISSpecialization'
 *       401:
 *         description: User not found or unauthorized
 */
router.get('/specializations', authenticate, controller.getSpecializations);

/**
 * @openapi
 * components:
 *   schemas:
 *     MISDoctor:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         position:
 *           type: string
 *         specialtyName:
 *           type: string
 *         branchName:
 *           type: string
 *         appointmentDurationMinutes:
 *           type: number
 * /mis/doctors:
 *   get:
 *     summary: Get medical specializations from MIS
 *     tags: [MIS]
 *     parameters:
 *       - name: branchId
 *         in: query
 *         description: Branch ID from MIS
 *         required: true
 *         schema:
 *           type: string
 *       - name: specializationId
 *         in: query
 *         description: Specialization ID from MIS
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Doctors fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 doctors:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MISDoctor'
 *       401:
 *         description: User not found or unauthorized
 */
router.get('/doctors', authenticate, controller.getDoctors);

router.get('/doctor/:id', authenticate, controller.getDoctor);

/**
 * @openapi
 * components:
 *   schemas:
 *     MISAvailableTime:
 *       type: object
 *       required:
 *         - startTime
 *         - endTime
 *         - available
 *       properties:
 *         startTime:
 *           type: string
 *           description: The start time of the slot
 *           example: "09:00"
 *         endTime:
 *           type: string
 *           description: The end time of the slot
 *           example: "09:30"
 *         available:
 *           type: boolean
 *           description: Whether the time slot is available
 *           example: true
 *     MISAvailableDay:
 *       type: object
 *       required:
 *         - date
 *         - timeSlots
 *       properties:
 *         date:
 *           type: string
 *           description: The date for this set of time slots
 *           example: "2023-12-01"
 *         timeSlots:
 *           type: array
 *           description: Array of time slots for this date
 *           items:
 *             $ref: '#/components/schemas/MISAvailableTime'
 *     MISAvailableSlots:
 *       type: object
 *       additionalProperties:
 *         $ref: '#/components/schemas/MISAvailableDay'
 * /mis/doctor/{doctorId}/available-slots:
 *   get:
 *     summary: Get medical specializations from MIS
 *     tags: [MIS]
 *     parameters:
 *       - name: doctorId
 *         in: path
 *         description: Doctor ID from MIS
 *         required: true
 *         schema:
 *           type: string
 *       - name: startDate
 *         in: query
 *         description: Start date
 *         required: true
 *         schema:
 *           type: string
 *       - name: endDate
 *         in: query
 *         description: End date
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Slots fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 availableSlots:
 *                   type: object
 *                   $ref: '#/components/schemas/MISAvailableSlots'
 *       401:
 *         description: User not found or unauthorized
 */
router.get('/doctor/:doctorId/available-slots', authenticate, controller.getDoctorAvailableSlots);

/**
 * @openapi
 * components:
 *   schemas:
 *     CreateMISAppointmentBody:
 *       type: object
 *       required:
 *         - doctorId
 *         - patientId
 *         - startTime
 *         - endTime
 *         - branchId
 *       properties:
 *         doctorId:
 *           type: string
 *           example: "f47ac10b-58cc-4372-a567-0e02b2c3d479"
 *         startTime:
 *           type: string
 *           example: "2025-09-10"
 *         endTime:
 *           type: string
 *           example: "2025-09-10"
 *         branchId:
 *           type: string
 *           example: "8b9a7c6d-5e4f-4321-a987-6543210fedcb"
 *         insuranceProgramId:
 *           type: string
 *           example: "8b9a7c6d-5e4f-4321-a987-6543210fedcb"
 * /mis/create-appointment:
 *   post:
 *     summary: Create a new appointment
 *     tags: [MIS]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateMISAppointmentBody'
 *     responses:
 *       200:
 *         description: Appointment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 description:
 *                   type: string
 *                   example: Appointment created
 *       401:
 *         description: User not found or unauthorized
 */
router.post('/create-appointment', authenticate, controller.createAppointment);

/**
 * @openapi
 * components:
 *   schemas:
 *     MISAppointment:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         doctor_name:
 *           type: string
 *         beneficiary_name:
 *           type: string
 *         branch_name:
 *           type: string
 *         start_time:
 *           type: string
 *         end_time:
 *           type: string
 *         status:
 *           type: string
 *         status_display:
 *           type: string
 *         record_type:
 *           type: string
 *         record_type_display:
 *           type: string
 *         appointment_type:
 *           type: string
 *         appointment_type_display:
 *           type: string
 *         notes:
 *           type: string
 * /mis/appointments:
 *   get:
 *     summary: Get patient appointments from MIS
 *     tags: [MIS]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Appointments fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 appointments:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MISAppointment'
 *       401:
 *         description: User not found or unauthorized
 */
router.get('/appointments', authenticate, controller.getAppointments);

/**
 * @openapi
 * /mis/appointments/{appointmentId}:
 *   delete:
 *     summary: Delete an appointment
 *     tags: [MIS]
 *     parameters:
 *       - name: appointmentId
 *         in: path
 *         description: Appointment ID to delete
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Appointment deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: User not found or unauthorized
 */
router.delete('/appointments/:appointmentId', authenticate, controller.removeAppointment);

export default router;
