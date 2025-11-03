import { Request, Response } from 'express';
import { query, param, body, validationResult } from 'express-validator';

import { AppError } from '@/shared/services/app-error.service';
import { ErrorCodes } from '@/shared/constants/error-codes';

import * as patientService from '../patient/patient.service';

import * as misService from './mis.service';

export const findPatient = async (req: Request, res: Response) => {
  if (!req?.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  await query('iin').notEmpty().withMessage('IIN is required').run(req);

  const patient = await misService.findPatientByIinAndPhone(
    (req.query.iin as string) || '',
    `8${req.user.phone.slice(1)}`
  );

  return res.status(200).json({
    success: true,
    patient,
  });
};

export const createPatient = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const patient = await misService.createPatient(req.body);

  return res.status(200).json({
    success: true,
    description: 'Patient created',
    patient,
  });
};

export const getBranches = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const branches = await misService.getBranches();

  return res.status(200).json({
    success: true,
    branches,
  });
};

export const getSpecializations = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  await query('branchId').notEmpty().withMessage('Branch ID is required').run(req);

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array(),
    });
  }

  const specializations = await misService.getSpecializationsByBranchId(
    req.query.branchId as string
  );

  return res.status(200).json({
    success: true,
    specializations,
  });
};

export const getDoctors = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  await query('specializationId').notEmpty().withMessage('Specialization ID is required').run(req);
  await query('branchId').notEmpty().withMessage('Branch ID is required').run(req);

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array(),
    });
  }

  const doctors = await misService.getDoctorsBySpecializationIdAndBranchId(
    req.query.specializationId as string,
    req.query.branchId as string
  );

  return res.status(200).json({
    success: true,
    doctors,
  });
};

export const getDoctor = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  await param('id').notEmpty().withMessage('Doctor ID is required').run(req);

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array(),
    });
  }

  const doctor = await misService.getDoctorDetailsById(req.params.id);

  return res.status(200).json({
    success: true,
    doctor,
  });
};

export const getDoctorAvailableSlots = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  await param('doctorId').notEmpty().withMessage('Doctor ID is required').run(req);
  await query('startDate').notEmpty().withMessage('Start date is required').run(req);
  await query('endDate').notEmpty().withMessage('End date is required').run(req);

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array(),
    });
  }

  const { doctorId } = req.params;
  const { startDate, endDate } = req.query;

  const availableSlots = await misService.getDoctorAvailableSlots(
    doctorId as string,
    startDate as string,
    endDate as string
  );

  return res.status(200).json({
    success: true,
    availableSlots,
  });
};

export const createAppointment = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  await body('doctorId').notEmpty().withMessage('Doctor ID is required').run(req);
  await body('startTime').notEmpty().withMessage('Start time is required').run(req);
  await body('endTime').notEmpty().withMessage('End time is required').run(req);
  await body('branchId').notEmpty().withMessage('Branch ID is required').run(req);
  await body('insuranceProgramId')
    .notEmpty()
    .withMessage('Insurance program ID is required')
    .run(req);

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array(),
    });
  }

  const { doctorId, startTime, endTime, branchId, insuranceProgramId, patientId } = req.body;
  const patient = await patientService.getPatientById(req.user.id);

  if (!patient) {
    return res.status(400).json({
      success: false,
      message: 'Patient not found',
    });
  }

  const appointment = await misService.createAppointment({
    doctorId,
    patientId: patientId || patient.misPatientId,
    startTime,
    endTime,
    branchId,
    insuranceProgramId,
  });

  return res.status(200).json({
    success: true,
    appointment,
  });
};

export const getAppointments = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const patient = await patientService.getPatientById(req.user.id);

  if (!patient) {
    return res.status(400).json({
      success: false,
      message: 'Patient not found',
    });
  }

  const appointments = await misService.getAppointments(patient.misPatientId);

  return res.status(200).json({
    success: true,
    appointments,
  });
};

export const getAppointmentHistory = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  const patient = await patientService.getPatientById(req.user.id);

  if (!patient) {
    return res.status(400).json({
      success: false,
      message: 'Patient not found',
    });
  }

  const appointmentHistory = await misService.getAppointmentHistory(patient.misPatientId);

  return res.status(200).json({
    success: true,
    appointmentHistory,
  });
};

export const removeAppointment = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 401);
  }

  await param('appointmentId').notEmpty().withMessage('Doctor ID is required').run(req);

  const patient = await patientService.getPatientById(req.user.id);

  if (!patient) {
    return res.status(400).json({
      success: false,
      message: 'Patient not found',
    });
  }

  await misService.removeAppointment(patient.misPatientId, req.params.appointmentId);

  return res.status(200).json({
    success: true,
  });
};
