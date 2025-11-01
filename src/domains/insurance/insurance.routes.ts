import { Router } from 'express';

import { authenticate } from '@/middlewares/auth.middleware';

import * as controller from './insurance.controller';

const router = Router();

/**
 * @openapi
 * /insurance/send-otp:
 *   post:
 *     summary: Send otp to user
 *     tags: [Insurance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OTP has been sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: OTP has been sent
 *       401:
 *         description: User not found or unauthorized
 */
router.post('/send-otp', authenticate, controller.sendOtp);

/**
 * @openapi
 * components:
 *   schemas:
 *     InsuranceVerifyOtpBody:
 *       type: object
 *       properties:
 *         otp:
 *           type: string
 * /insurance/verify-otp:
 *   post:
 *     summary: Verify OTP
 *     tags: [Insurance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/InsuranceVerifyOtpBody'
 *     responses:
 *       200:
 *         description: OTP successfully verified
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: OTP successfully verified
 *       401:
 *         description: User not found or unauthorized
 */
router.post('/verify-otp', authenticate, controller.verifyOtp);

/**
 * @openapi
 * components:
 *   schemas:
 *     FileItem:
 *       type: object
 *       required: [fileType, fileName, content]
 *       properties:
 *         fileType:
 *           type: string
 *           example: 'Кассовый чек'
 *         fileName:
 *           type: string
 *           description: File name with extension
 *           example: 'cheque.pdf'
 *         content:
 *           type: string
 *           format: byte
 *           description: Base64-encoded content; can be empty if not provided yet
 *           minLength: 0
 *           example: ''
 *     Files:
 *       type: array
 *       minItems: 1
 *       items:
 *         $ref: '#/components/schemas/FileItem'
 *     RefundRequestBody:
 *       type: object
 *       properties:
 *         date:
 *           type: string
 *           example: '2025-09-01'
 *         amount:
 *           type: number
 *           example: 1000
 *         personId:
 *           type: string
 *           example: 'a2f6c7d8-3b1e-4f0a-9c3d-7e5a1b2c3d4e'
 *         programId:
 *           type: string
 *           example: 'a2f6c7d8-3b1e-4f0a-9c3d-7e5a1b2c3d4e'
 *         files:
 *           $ref: '#/components/schemas/Files'
 * /insurance/refund-request:
 *   post:
 *     summary: Verify OTP
 *     tags: [Insurance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefundRequestBody'
 *     responses:
 *       200:
 *         description: Refund request successfully sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Refund request successfully sent
 *       401:
 *         description: User not found or unauthorized
 */
router.post('/refund-request', authenticate, controller.refundRequest);

/**
 * @openapi
 * components:
 *   schemas:
 *     InsuranceProgram:
 *       type: object
 *       required: [id, code, title, status, cardNo, dateStart, dateEnd]
 *       properties:
 *         id:
 *           type: string
 *           example: "1234"
 *         code:
 *           type: string
 *           example: "PRG001"
 *         title:
 *           type: string
 *           example: "Basic Insurance"
 *         status:
 *           type: string
 *           example: "active"
 *         cardNo:
 *           type: string
 *           example: "4111111111111111"
 *         dateStart:
 *           type: string
 *           format: date
 *           example: "2025-01-01"
 *         dateEnd:
 *           type: string
 *           format: date
 *           example: "2025-12-31"
 *     InsuranceProgramsResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         programs:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/InsuranceProgram'
 * /insurance/programs:
 *   get:
 *     summary: Get list of programs from insurance service
 *     tags: [Insurance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Response
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InsuranceProgramsResponse'
 *       401:
 *         description: Unauthorized
 */
router.get('/programs', authenticate, controller.getPrograms);

/**
 * @openapi
 * components:
 *   schemas:
 *     InsuranceProgramExtended:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         code:
 *           type: string
 *         title:
 *           type: string
 *         status:
 *           type: string
 *         cardNo:
 *           type: string
 *         insurer:
 *           type: string
 *         insuranceCompany:
 *           type: string
 *         dateStart:
 *           type: string
 *           format: date
 *         dateEnd:
 *           type: string
 *           format: date
 *         information:
 *           type: string
 *         programUrl:
 *           type: string
 *         stdexclusions:
 *           type: string
 *         exclusions:
 *           type: string
 *         inclusions:
 *           type: string
 *         limit:
 *           type: number
 *         currentLimit:
 *           type: number
 *         logo:
 *           type: string
 *         subLimits:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               limit:
 *                 type: number
 *               currentLimit:
 *                 type: number
 *               incidentLimit:
 *                 type: number
 *               currentIncidentLimit:
 *                 type: number
 *     InsuranceProgramResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         program:
 *           type: object
 *           $ref: '#/components/schemas/InsuranceProgramExtended'
 * /insurance/programs/{programId}:
 *   get:
 *     summary: Get insurance program by id
 *     tags: [Insurance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: programId
 *         in: path
 *         description: Program ID
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Response
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InsuranceProgramResponse'
 *       401:
 *         description: Unauthorized
 */
router.get('/programs/:programId', authenticate, controller.getProgramById);

/**
 * @openapi
 * components:
 *   schemas:
 *     InsuranceFamily:
 *       type: object
 *       required: [id, fullName, relationship, dateBirth]
 *       properties:
 *         id:
 *           type: string
 *           example: "1234"
 *         fullName:
 *           type: string
 *           example: "John Doe"
 *         relationship:
 *           type: string
 *           example: "spouse"
 *         dateBirth:
 *           type: string
 *           format: date
 *           example: "1990-01-01"
 *     InsuranceFamilyResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         family:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/InsuranceFamily'
 * /insurance/family:
 *   get:
 *     summary: Get information about family members from insurance service
 *     tags: [Insurance]
 *     parameters:
 *       - name: programId
 *         in: query
 *         description: Program ID
 *         required: true
 *         schema:
 *           type: string
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Response
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InsuranceFamilyResponse'
 *       401:
 *         description: Unauthorized
 */
router.get('/family', authenticate, controller.getFamily);

/**
 * @openapi
 * components:
 *   schemas:
 *     InsuranceRefundRequest:
 *       type: object
 *       required: [id, sender, person, phoneNo, date, amount, status]
 *       properties:
 *         id:
 *           type: number
 *           example: 1234
 *         sender:
 *           type: string
 *           example: "John Doe"
 *         person:
 *           type: string
 *           example: "Jane Doe"
 *         phoneNo:
 *           type: string
 *           example: "+77071234567"
 *         date:
 *           type: string
 *           format: date
 *           example: "2025-09-01"
 *         amount:
 *           type: number
 *           example: 1000
 *         status:
 *           type: string
 *           example: "pending"
 *     InsuranceRefundRequestsResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         refundRequests:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/InsuranceRefundRequest'
 * /insurance/refund-requests:
 *   get:
 *     summary: Get list of refund requests
 *     tags: [Insurance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Response
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InsuranceRefundRequestsResponse'
 *       401:
 *         description: Unauthorized
 */
router.get('/refund-requests', authenticate, controller.getRefundRequests);

router.get('/certificate/:programId', authenticate, controller.getInsuranceCertificate);

/**
 * @openapi
 * components:
 *   schemas:
 *     AvailableInsuranceCity:
 *       type: object
 *       required: [id, title]
 *       properties:
 *         id:
 *           type: number
 *           example: 1
 *         title:
 *           type: string
 *           example: "Астана"
 * /insurance/cities:
 *   get:
 *     summary: Get list of cities from insurance service
 *     tags: [Insurance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 cities:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AvailableInsuranceCity'
 *       401:
 *         description: Unauthorized
 */
router.get('/cities', authenticate, controller.getAvailableCities);

/**
 * @openapi
 * components:
 *   schemas:
 *     MedicalNetworkClinics:
 *       type: object
 *       properties:
 *         id:
 *           type: number
 *           example: 1
 *         city:
 *           type: number
 *           example: 1
 *         title:
 *           type: string
 *           example: "Medical Center"
 *         address:
 *           type: string
 *           example: "123 Healthcare St."
 *         contacts:
 *           type: null
 *           example: null
 *         latitude:
 *           type: number
 *           example: 51.1801
 *         longitude:
 *           type: number
 *           example: 71.446
 *         link2GIS:
 *           type: string
 *           example: "https://2gis.kz/clinic"
 *         extraInformation:
 *           type: null
 *           example: null
 * /insurance/medical-network:
 *   get:
 *     summary: Get list of medical network locations
 *     tags: [Insurance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: cityId
 *         in: query
 *         description: City ID
 *         required: true
 *         schema:
 *           type: string
 *       - name: programId
 *         in: query
 *         description: Program ID
 *         required: true
 *         schema:
 *           type: string
 *       - name: type
 *         in: query
 *         description: Clinic type ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 clinics:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MedicalNetworkClinics'
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Bad Request - Missing required parameters
 */
router.get('/medical-network', authenticate, controller.getMedicalNetwork);

/**
 * @openapi
 * components:
 *   schemas:
 *     ElectronicReferralDetail:
 *       type: object
 *       properties:
 *         id:
 *           type: number
 *         service:
 *           type: string
 *         amount:
 *           type: number
 *     ElectronicReferralItem:
 *       type: object
 *       properties:
 *         id:
 *           type: number
 *         date:
 *           type: string
 *           example: "10.11.2020"
 *         name:
 *           type: string
 *           example: "Иванов Иван Иванович"
 *         medical_institution:
 *           type: string
 *           example: "Алматы, ТОО Архимедес"
 *         diagnosis:
 *           type: string
 *           example: "Остеохондроз"
 *         amount:
 *           type: number
 *           example: 3850
 *         currency:
 *           type: string
 *           example: "KZT"
 *         appointmentDetail:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ElectronicReferralDetail'
 * /insurance/electronic-referrals:
 *   get:
 *     summary: Get electronic referrals (appointments)
 *     tags: [Insurance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: programId
 *         in: query
 *         description: Program ID
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 electronicReferrals:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ElectronicReferralItem'
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Bad Request - Missing required parameters
 */
router.get('/electronic-referrals', authenticate, controller.getElectronicReferrals);

/**
 * @openapi
 * components:
 *   schemas:
 *     ContactInfo:
 *       type: object
 *       required: [city, phones]
 *       properties:
 *         city:
 *           type: string
 *           example: "Астана"
 *         phones:
 *           type: array
 *           items:
 *             type: string
 *           example: ["+7 (7172) 123-456", "+7 (7172) 654-321"]
 * /insurance/contacts:
 *   get:
 *     summary: Get insurance contact information
 *     tags: [Insurance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 contacts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ContactInfo'
 *       401:
 *         description: Unauthorized
 */
router.get('/contacts', authenticate, controller.getContacts);

export default router;
