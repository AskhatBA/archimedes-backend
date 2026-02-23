import { Request, Response } from 'express';
import { Platform } from '@prisma/client';
import { body, param } from 'express-validator';

import { ErrorCodes } from '@/shared/constants/error-codes';
import { AppError } from '@/shared/services/app-error.service';

import * as notificationService from './notifications.service';

export const registerDevice = async (req: Request, res: Response) => {
  if (!req?.user) {
    throw new AppError('User not found', 401);
  }

  await body('deviceId').notEmpty().withMessage('Device ID is required').run(req);
  await body('platform').notEmpty().withMessage('Platform is required').run(req);

  const { deviceId, platform } = req.body;

  if (!Object.values(Platform).includes(platform)) {
    throw new AppError(ErrorCodes.NOTIFICATIONS_PLATFORM_NOT_VALID, 400);
  }

  const deviceToken = await notificationService.registerDeviceToken(
    req.user.id,
    deviceId,
    platform as Platform
  );

  return res.status(201).json({
    success: true,
    data: deviceToken,
  });
};

export const unregisterDevice = async (req: Request, res: Response) => {
  if (!req?.user) {
    throw new AppError('User not found', 401);
  }

  await param('deviceId').notEmpty().withMessage('Device ID is required').run(req);

  const { deviceId } = req.params;

  await notificationService.unregisterDeviceToken(req.user.id, deviceId);

  return res.status(200).json({
    success: true,
    message: 'Device unregistered successfully',
  });
};

export const getUserDevices = async (req: Request, res: Response) => {
  if (!req?.user) {
    throw new AppError('User not found', 401);
  }

  const devices = await notificationService.getUserDeviceTokens(req.user.id);

  return res.status(200).json({
    success: true,
    data: devices,
  });
};

export const sendNotification = async (req: Request, res: Response) => {
  if (!req?.user) {
    throw new AppError('User not found', 401);
  }

  await body('message').withMessage('Message is required').run(req);

  const { title, message, data } = req.body;

  await notificationService.sendPushNotification(req.user.id, title, message, data);

  return res.status(200).json({
    success: true,
    message: 'Notification sent successfully',
  });
};
