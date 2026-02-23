import { sendOneSignalPushNotification } from '@/shared/lib/one-signal/one-signal.service';

export const sendPushNotification = async (userId: string, message: string) => {
  const notification = {
    playerIds: [userId],
    heading: { ru: 'New Message' },
    content: { ru: message },
  };
  await sendOneSignalPushNotification(notification);
};
