import nodemailer, { Transporter } from 'nodemailer';

import { config } from '@/config';
import { createLogger } from '@/shared/lib/logger';

const mailLogger = createLogger('mail');

export interface SendMailOptions {
  to: string[];
  subject: string;
  /** Plain-text body — the fallback for clients that refuse HTML. */
  text: string;
  html?: string;
}

// Built once and reused: nodemailer pools the SMTP connection, and rebuilding the
// transport per message would open a new session for every order.
let transporter: Transporter | null = null;

const getTransporter = (): Transporter => {
  if (transporter) return transporter;

  const { host, port, secure, user, password, rejectUnauthorized } = config.mail.smtp;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    // Plain port 25 relays commonly offer STARTTLS with a self-signed certificate;
    // `ignoreTLS` is deliberately not set, so it is still used when offered.
    tls: { rejectUnauthorized },
    // A password must never cross a cleartext session: when credentials are
    // configured, STARTTLS stops being optional.
    ...(user && password
      ? { auth: { user, pass: password }, requireTLS: true }
      : {}),
  });

  mailLogger.info({ host, port, secure, authenticated: Boolean(user) }, 'SMTP transport created');

  return transporter;
};

/**
 * Sends one message through the clinic's SMTP relay.
 *
 * Throws when the relay refuses it — callers are queue workers, so a failure is
 * retried by BullMQ rather than swallowed here. Never call this inline in a request
 * or in a payment callback: SMTP is slow and external.
 */
export const sendMail = async ({ to, subject, text, html }: SendMailOptions): Promise<void> => {
  if (!config.mail.enabled) {
    mailLogger.warn({ subject, to }, 'Mail disabled, message not sent');
    return;
  }

  if (to.length === 0) {
    mailLogger.warn({ subject }, 'No recipients configured, message not sent');
    return;
  }

  const info = await getTransporter().sendMail({
    from: config.mail.from,
    to: to.join(', '),
    subject,
    text,
    ...(html ? { html } : {}),
  });

  mailLogger.info({ messageId: info.messageId, to, subject }, 'Mail sent');
};

/** Checks the relay answers at all — used by the startup probe, not per message. */
export const verifyMailTransport = async (): Promise<void> => {
  await getTransporter().verify();
};
