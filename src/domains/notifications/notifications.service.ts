import { Platform } from '@prisma/client';

import { sendOneSignalPushNotification } from '@/shared/lib/one-signal/one-signal.service';
import { ErrorCodes } from '@/shared/constants/error-codes';
import { AppError } from '@/shared/services/app-error.service';
import * as db from '@/infrastructure/db';

/**
 * Register a device token for push notifications
 */
export const registerDeviceToken = async (userId: string, deviceId: string, platform: Platform) => {
  // Check if device already exists
  const existingDevice = await db.prismaClient.deviceToken.findUnique({
    where: { deviceId },
  });

  if (existingDevice) {
    // Update if owned by different user or update timestamp
    return db.prismaClient.deviceToken.update({
      where: { deviceId },
      data: {
        userId,
        platform,
      },
    });
  }

  // Create new device token
  return db.prismaClient.deviceToken.create({
    data: {
      userId,
      deviceId,
      platform,
    },
  });
};

/**
 * Unregister a device token
 */
export const unregisterDeviceToken = async (userId: string, deviceId: string) => {
  const device = await db.prismaClient.deviceToken.findUnique({
    where: { deviceId },
  });

  if (!device) {
    throw new AppError(ErrorCodes.NOTIFICATIONS_DEVICE_NOT_FOUND, 404);
  }

  if (device.userId !== userId) {
    throw new AppError(ErrorCodes.FORBIDDEN, 403);
  }

  await db.prismaClient.deviceToken.delete({
    where: { deviceId },
  });
};

/**
 * Get all device tokens for a user
 */
export const getUserDeviceTokens = async (userId: string) => {
  return db.prismaClient.deviceToken.findMany({
    where: { userId },
    select: {
      id: true,
      deviceId: true,
      platform: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
};

/**
 * Send push notification to a user
 */
export const sendPushNotification = async (
  userId: string,
  title: string,
  message: string,
  data?: Record<string, any>
) => {
  // Get all device tokens for the user
  const devices = await db.prismaClient.deviceToken.findMany({
    where: { userId },
    select: { deviceId: true },
  });

  if (devices.length === 0) {
    throw new AppError(ErrorCodes.NOTIFICATIONS_DEVICE_NOT_FOUND, 404);
  }

  const playerIds = devices.map((device: { deviceId: string }) => device.deviceId);

  // Send notification via OneSignal
  const notification = {
    playerIds,
    heading: { en: title, ru: title },
    content: { en: message, ru: message },
    data: data || {},
  };

  console.log('Send notification via OneSignal: ', notification);

  await sendOneSignalPushNotification(notification);
};

/**
 * Send push notification to multiple users
 */
export const sendBulkPushNotification = async (
  userIds: string[],
  title: string,
  message: string,
  data?: Record<string, any>
) => {
  // Get all device tokens for the users
  const devices = await db.prismaClient.deviceToken.findMany({
    where: {
      userId: { in: userIds },
    },
    select: { deviceId: true },
  });

  if (devices.length === 0) {
    return;
  }

  const playerIds = devices.map((device: { deviceId: string }) => device.deviceId);

  // Send notification via OneSignal
  const notification = {
    playerIds,
    heading: { en: title, ru: title },
    content: { en: message, ru: message },
    data: data || {},
  };

  await sendOneSignalPushNotification(notification);
};
