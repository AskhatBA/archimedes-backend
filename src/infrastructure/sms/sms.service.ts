import twilio from 'twilio';

import { AppError } from '@/shared/services/app-error.service';
import { config } from '@/config';

const client = twilio(config.twilio.accountSid, config.twilio.authToken);

export const sendSMS = async (to: string, message: string) => {
  console.log(`Sending SMS to ${to}`);
  try {
    const result = await client.messages.create({
      body: message,
      from: config.twilio.phoneNumber,
      to: to,
    });

    console.log(`SMS sent successfully. SID: ${result.sid}`);
    return result;
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw new AppError('Failed to send SMS', 400);
  }
};

export const getMessageStatus = async (messageSid: string) => {
  try {
    const message = await client.messages(messageSid).fetch();
    return {
      sid: message.sid,
      status: message.status,
      dateCreated: message.dateCreated,
      dateSent: message.dateSent,
      errorCode: message.errorCode,
      errorMessage: message.errorMessage,
    };
  } catch (error) {
    console.error('Error fetching message status:', error);
    throw new Error('Failed to fetch message status');
  }
};

export const getAccountInfo = async () => {
  try {
    const account = await client.api.accounts(config.twilio.accountSid).fetch();
    return {
      sid: account.sid,
      friendlyName: account.friendlyName,
      status: account.status,
      type: account.type,
    };
  } catch (error) {
    console.error('Error fetching account info:', error);
    throw new Error('Failed to fetch account information');
  }
};
