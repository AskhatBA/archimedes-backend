import { Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { Role } from '@prisma/client';

import { AppError } from '@/shared/services/app-error.service';

import * as appointmentsService from './appointments.service';

export const getAppointments = async (req: Request, res: Response) => {
  if (!req?.user) {
    throw new AppError('User not found', 401);
  }

  const appointments = await appointmentsService.getAllAppointments(req.user.id);

  return res.status(200).json({
    success: true,
    appointments,
  });
};

export const getAppointmentById = async (req: Request, res: Response) => {
  if (!req?.user) {
    throw new AppError('User not found', 401);
  }

  await param('id').isUUID().withMessage('Invalid appointment ID').run(req);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const appointment = await appointmentsService.getAppointmentById(req.params.id, req.user.id);

  if (!appointment) {
    return res.status(404).json({
      success: false,
      message: 'Appointment not found',
    });
  }

  return res.status(200).json({
    success: true,
    appointment,
  });
};

export const createAppointment = async (req: Request, res: Response) => {
  if (!req?.user) {
    throw new AppError('User not found', 401);
  }

  await body('patientId').isUUID().withMessage('Invalid patient ID').run(req);
  await body('doctorId').isUUID().withMessage('Invalid doctor ID').run(req);
  await body('externalId').isUUID().withMessage('Invalid external ID').run(req);
  await body('dateTime').isISO8601().withMessage('Invalid date time format').run(req);
  await body('notes').optional().isString().withMessage('Notes must be a string').run(req);
  await body('status')
    .optional()
    .isIn(['SCHEDULED', 'COMPLETED', 'CANCELLED'])
    .withMessage('Invalid status')
    .run(req);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const appointment = await appointmentsService
    .createAppointment({
      patientId: req.body.patientId,
      doctorId: req.body.doctorId,
      externalId: req.body.externalId,
      dateTime: new Date(req.body.dateTime),
      notes: req.body.notes,
      status: req.body.status,
    })
    .catch((err) => {
      console.log(err);
    });

  return res.status(201).json({
    success: true,
    appointment,
  });
};

export const updateAppointment = async (req: Request, res: Response) => {
  if (!req?.user) {
    throw new AppError('User not found', 401);
  }

  await param('id').isUUID().withMessage('Invalid appointment ID').run(req);
  await body('dateTime').optional().isISO8601().withMessage('Invalid date time format').run(req);
  await body('status')
    .optional()
    .isIn(['SCHEDULED', 'COMPLETED', 'CANCELLED'])
    .withMessage('Invalid status')
    .run(req);
  await body('notes').optional().isString().withMessage('Notes must be a string').run(req);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const result = await appointmentsService.updateAppointment(
    req.params.id,
    req.user.id,
    req.user.role as Role,
    {
      dateTime: new Date(req.body.dateTime),
      status: req.body.status,
      notes: req.body.notes,
    }
  );

  if (result.count === 0) {
    return res.status(404).json({
      success: false,
      message: 'Appointment not found or you do not have permission to update it',
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Appointment updated successfully',
  });
};

export const deleteAppointment = async (req: Request, res: Response) => {
  if (!req?.user) {
    throw new AppError('User not found', 401);
  }

  await param('id').isUUID().withMessage('Invalid appointment ID').run(req);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const result = await appointmentsService.deleteAppointment(
    req.params.id,
    req.user.id,
    req.user.role as Role
  );

  if (result.count === 0) {
    return res.status(404).json({
      success: false,
      message: 'Appointment not found or you do not have permission to delete it',
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Appointment deleted successfully',
  });
};

export const cancelAppointment = async (req: Request, res: Response) => {
  if (!req?.user) {
    throw new AppError('User not found', 401);
  }

  await param('id').isUUID().withMessage('Invalid appointment ID').run(req);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const result = await appointmentsService.cancelAppointment(
    req.params.id,
    req.user.id,
    req.user.role as Role
  );

  if (result.count === 0) {
    return res.status(404).json({
      success: false,
      message: 'Appointment not found or you do not have permission to cancel it',
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Appointment cancelled successfully',
  });
};
