import axios from 'axios';

import { config } from '@/config';

export const oneSignalNotificationHttp = axios.create({
  baseURL: 'https://onesignal.com/api/v1/notifications',
  headers: {
    Authorization: `Basic ${config.oneSignal.apiAuthKey}`,
    'Content-Type': 'application/json',
  },
});
