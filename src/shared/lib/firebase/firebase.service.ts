import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { BatchResponse, getMessaging } from 'firebase-admin/messaging';

import { config } from '@/config';

import { FcmPushNotification } from './firebase.types';

// One multicast request takes at most this many tokens.
const FCM_MULTICAST_LIMIT = 500;

// Per-token errors after which the token will never work again: the app was removed,
// the user signed out (the app deletes its token), or the token was never an FCM one.
const STALE_TOKEN_ERRORS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

let firebaseApp: App | undefined;

// Initialised on first send rather than at import, so a server without Firebase
// credentials still starts and only pushes fail.
const getFirebaseApp = (): App => {
  if (firebaseApp) return firebaseApp;

  const { projectId, clientEmail, privateKey } = config.firebase;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase credentials not configured. Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY'
    );
  }

  firebaseApp =
    getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return firebaseApp;
};

// FCM data values must be strings, while callers pass booleans and the like as they are.
const toFcmData = (data: Record<string, unknown> = {}): Record<string, string> =>
  Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)])
  );

export interface FcmSendResult {
  successCount: number;
  failureCount: number;
  /** Tokens FCM will never deliver to again — safe to delete. */
  staleTokens: string[];
  /** First message id FCM returned, for tracing a notification back to FCM. */
  messageId: string | null;
  /** Error codes per failed token, without the tokens themselves. */
  errors: string[];
}

export const sendFcmPushNotification = async (
  notification: FcmPushNotification
): Promise<FcmSendResult> => {
  const messaging = getMessaging(getFirebaseApp());
  const data = toFcmData(notification.data);

  const result: FcmSendResult = {
    successCount: 0,
    failureCount: 0,
    staleTokens: [],
    messageId: null,
    errors: [],
  };

  for (let i = 0; i < notification.tokens.length; i += FCM_MULTICAST_LIMIT) {
    const tokens = notification.tokens.slice(i, i + FCM_MULTICAST_LIMIT);
    const response: BatchResponse = await messaging.sendEachForMulticast({
      tokens,
      notification: { title: notification.title, body: notification.body },
      data,
      android: { priority: 'high', notification: { sound: 'default' } },
      apns: { payload: { aps: { sound: 'default' } } },
    });

    result.successCount += response.successCount;
    result.failureCount += response.failureCount;

    response.responses.forEach((sendResponse, index) => {
      if (sendResponse.success) {
        result.messageId ??= sendResponse.messageId ?? null;
        return;
      }
      const code = sendResponse.error?.code ?? 'unknown';
      result.errors.push(code);
      if (STALE_TOKEN_ERRORS.has(code)) result.staleTokens.push(tokens[index]);
    });
  }

  return result;
};
