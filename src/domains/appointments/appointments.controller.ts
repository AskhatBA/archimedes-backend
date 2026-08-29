import { Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { AppointmentStatus, Role } from '@prisma/client';

import { AppError } from '@/shared/services/app-error.service';
import * as auditLogService from '@/shared/services/audit-log.service';
import { AuditEvent } from '@/shared/services/audit-log.service';

import * as appointmentsService from './appointments.service';
import * as appointmentsAdminService from './appointments.admin.service';

export const getAppointments = async (req: Request, res: Response) => {
  if (!req?.user) {
    throw new AppError('User not found', 401);
  }

  const appointments = await appointmentsService.getAllAppointments(req.user.id);

  auditLogService.log({
    event: AuditEvent.APPOINTMENT_LIST_VIEWED,
    success: true,
    userId: req.user.id,
    phone: req.user.phone,
    req,
  });

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
    auditLogService.log({
      event: AuditEvent.APPOINTMENT_ACCESS_DENIED,
      success: false,
      userId: req.user.id,
      phone: req.user.phone,
      req,
      metadata: { action: 'get', appointmentId: req.params.id },
    });
    return res.status(404).json({
      success: false,
      message: 'Appointment not found',
    });
  }

  auditLogService.log({
    event: AuditEvent.APPOINTMENT_VIEWED,
    success: true,
    userId: req.user.id,
    phone: req.user.phone,
    req,
    metadata: { appointmentId: req.params.id },
  });

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

  let appointment;
  try {
    appointment = await appointmentsService.createAppointment({
      userId: req.user.id,
      patientId: req.body.patientId,
      doctorId: req.body.doctorId,
      externalId: req.body.externalId,
      dateTime: new Date(req.body.dateTime),
      notes: req.body.notes,
      status: req.body.status,
    });
  } catch (err) {
    await auditLogService.log({
      event: AuditEvent.APPOINTMENT_CONFLICT,
      success: false,
      userId: req.user.id,
      phone: req.user.phone,
      req,
      metadata: {
        reason: err instanceof AppError ? err.message : 'Appointment creation failed',
        doctorId: req.body.doctorId as string,
        dateTime: req.body.dateTime as string,
      },
    });
    throw err;
  }

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

  const result = await appointmentsService.updateAppointment(req.params.id, req.user.id, {
    dateTime: new Date(req.body.dateTime),
    status: req.body.status,
    notes: req.body.notes,
  });

  if (result.count === 0) {
    auditLogService.log({
      event: AuditEvent.APPOINTMENT_ACCESS_DENIED,
      success: false,
      userId: req.user.id,
      phone: req.user.phone,
      req,
      metadata: { action: 'update', appointmentId: req.params.id },
    });
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
    auditLogService.log({
      event: AuditEvent.APPOINTMENT_ACCESS_DENIED,
      success: false,
      userId: req.user.id,
      phone: req.user.phone,
      req,
      metadata: { action: 'delete', appointmentId: req.params.id },
    });
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

  const result = await appointmentsService.cancelAppointment(req.params.id, req.user.id);

  if (result.count === 0) {
    auditLogService.log({
      event: AuditEvent.APPOINTMENT_ACCESS_DENIED,
      success: false,
      userId: req.user.id,
      phone: req.user.phone,
      req,
      metadata: { action: 'cancel', appointmentId: req.params.id },
    });
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

/* ------------------------------------------------------------------ dashboard ---- */

const ADMIN_DEFAULT_LIMIT = 20;
const ADMIN_MAX_LIMIT = 100;

const parsePositiveInt = (value: unknown, fallback: number, max?: number): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return max ? Math.min(parsed, max) : parsed;
};

const parseStatus = (value: unknown): AppointmentStatus | undefined => {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !(value in AppointmentStatus)) {
    throw new AppError('Invalid status', 400);
  }
  return value as AppointmentStatus;
};

const parseBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === '') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new AppError('Invalid telemedicine flag', 400);
};

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Day filters are calendar days, not timestamps — the service reads them in clinic time. */
const parseDay = (value: unknown, field: string): string | undefined => {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !DAY_PATTERN.test(value)) {
    throw new AppError(`${field} must be a date in YYYY-MM-DD format`, 400);
  }
  return value;
};

export const getAdminAppointments = async (req: Request, res: Response): Promise<void> => {
  const result = await appointmentsAdminService.getAdminAppointments({
    page: parsePositiveInt(req.query.page, 1),
    limit: parsePositiveInt(req.query.limit, ADMIN_DEFAULT_LIMIT, ADMIN_MAX_LIMIT),
    search: typeof req.query.search === 'string' ? req.query.search.trim() : undefined,
    status: parseStatus(req.query.status),
    telemedicine: parseBoolean(req.query.telemedicine),
    dateFrom: parseDay(req.query.dateFrom, 'dateFrom'),
    dateTo: parseDay(req.query.dateTo, 'dateTo'),
  });

  res.status(200).json({ success: true, ...result });
};

export const getAdminAppointment = async (req: Request, res: Response): Promise<void> => {
  const appointment = await appointmentsAdminService.getAdminAppointmentById(
    req.params.id as string
  );

  res.status(200).json({ success: true, appointment });
};
