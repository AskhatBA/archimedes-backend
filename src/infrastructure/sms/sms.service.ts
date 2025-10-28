import axios from 'axios';

import { config } from '@/config';
import { AppError } from '@/shared/services/app-error.service';

const client = axios.create({
  baseURL: config.smsService.apiUrl || '',
});

export const sendSMS = async (to: string, message: string) => {
  try {
    const result = await client.get('/', {
      params: {
        action: 'sendmessage',
        username: config.smsService.username,
        password: config.smsService.password,
        recipient: to,
        messagetype: 'SMS:TEXT',
        originator: config.smsService.originator,
        messagedata: message,
      },
    });
    return result;
  } catch (error) {
    throw new AppError('Failed to send SMS', 400);
  }
};
