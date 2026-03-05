import { config } from '@/config';

import { OneSignalPushNotification } from './one-signal.types';
import { oneSignalNotificationHttp } from './one-signal.helpers';

export const sendOneSignalPushNotification = (notification: OneSignalPushNotification) => {
  return oneSignalNotificationHttp.post('/', {
    app_id: config.oneSignal.appId,
    include_player_ids: notification.playerIds,
    headings: notification.heading,
    contents: notification.content,
    ios_badgeType: 'Increase',
    ios_badgeCount: 1,
  });
};
