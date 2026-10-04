import { Platform } from '@prisma/client';

import { FcmSendResult, sendFcmPushNotification } from '@/shared/lib/firebase/firebase.service';
import { ErrorCodes } from '@/shared/constants/error-codes';
import { AppError } from '@/shared/services/app-error.service';
import * as db from '@/infrastructure/db';
import { createLogger } from '@/shared/lib/logger';

const notificationsLogger = createLogger('notifications');

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

// Drops tokens FCM reported as dead, so the next push to the user does not try them again.
const removeStaleDeviceTokens = async (staleTokens: string[]) => {
  if (staleTokens.length === 0) return;
  const { count } = await db.prismaClient.deviceToken.deleteMany({
    where: { deviceId: { in: staleTokens } },
  });
  notificationsLogger.info({ count }, 'Removed stale device tokens');
};

const toPushResponse = (result: FcmSendResult) => ({
  successCount: result.successCount,
  failureCount: result.failureCount,
  errors: result.errors,
});

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

  const tokens = devices.map((device: { deviceId: string }) => device.deviceId);

  // Device tokens identify a user's handset, so only their count is logged.
  notificationsLogger.debug(
    { userId, deviceCount: tokens.length, title },
    'Sending push notification'
  );

  try {
    const result = await sendFcmPushNotification({ tokens, title, body: message, data });
    await removeStaleDeviceTokens(result.staleTokens);

    // Nothing delivered is a failure, so the reminder worker retries it.
    if (result.successCount === 0) {
      throw new Error(
        `FCM delivered to none of ${tokens.length} device(s): ${result.errors.join(', ')}`
      );
    }

    notificationsLogger.info(
      {
        userId,
        deviceCount: tokens.length,
        successCount: result.successCount,
        pushMessageId: result.messageId,
      },
      'Push notification sent'
    );

    // Save notification to database
    await db.prismaClient.notification.create({
      data: {
        userId,
        title,
        message,
        data: data || {},
        status: 'SENT',
        pushMessageId: result.messageId,
        pushResponse: toPushResponse(result),
      },
    });
  } catch (error) {
    notificationsLogger.error(
      { err: error, userId, deviceCount: tokens.length },
      'Push notification failed'
    );

    // Save failed notification to database
    await db.prismaClient.notification.create({
      data: {
        userId,
        title,
        message,
        data: data || {},
        status: 'FAILED',
        pushResponse: error instanceof Error ? { error: error.message } : {},
      },
    });
    throw error;
  }
};

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

  const tokens = devices.map((device: { deviceId: string }) => device.deviceId);

  try {
    const result = await sendFcmPushNotification({ tokens, title, body: message, data });
    await removeStaleDeviceTokens(result.staleTokens);

    // Save notification to database for each user
    const notificationRecords = userIds.map((userId) => ({
      userId,
      title,
      message,
      data: data || {},
      status: 'SENT' as const,
      pushMessageId: result.messageId,
      pushResponse: toPushResponse(result),
    }));

    await db.prismaClient.notification.createMany({
      data: notificationRecords,
    });
  } catch (error) {
    // Save failed notifications to database for each user
    const failedNotificationRecords = userIds.map((userId) => ({
      userId,
      title,
      message,
      data: data || {},
      status: 'FAILED' as const,
      pushResponse: error instanceof Error ? { error: error.message } : {},
    }));

    await db.prismaClient.notification.createMany({
      data: failedNotificationRecords,
    });
    throw error;
  }
};

export const getUserNotifications = async (
  userId: string,
  limit: number = 50,
  offset: number = 0
) => {
  return db.prismaClient.notification.findMany({
    where: { userId },
    select: {
      id: true,
      title: true,
      message: true,
      data: true,
      status: true,
      isRead: true,
      readAt: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
    skip: offset,
  });
};

/**
 * Mark a notification as read
 */
export const markNotificationAsRead = async (userId: string, notificationId: string) => {
  const notification = await db.prismaClient.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw new AppError(ErrorCodes.NOTIFICATIONS_DEVICE_NOT_FOUND, 404);
  }

  if (notification.userId !== userId) {
    throw new AppError(ErrorCodes.FORBIDDEN, 403);
  }

  return db.prismaClient.notification.update({
    where: { id: notificationId },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
};

/**
 * Mark all notifications as read for a user
 */
export const markAllNotificationsAsRead = async (userId: string) => {
  return db.prismaClient.notification.updateMany({
    where: {
      userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
};

/**
 * Get unread notification count for a user
 */
export const getUnreadNotificationCount = async (userId: string) => {
  return db.prismaClient.notification.count({
    where: {
      userId,
      isRead: false,
    },
  });
};
