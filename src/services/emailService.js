import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter = null;

/**
 * With no SMTP_HOST configured (the dev default) emails are logged to the
 * console rather than sent. Setting SMTP_* in the environment switches this to
 * a real transport with no code change.
 */
const getTransporter = () => {
  if (!env.smtpHost) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
    });
  }
  return transporter;
};

/**
 * Never throws — a failed notification email must not fail the request that
 * triggered it.
 */
export const sendMail = async ({ to, subject, text, html }) => {
  const transport = getTransporter();

  if (!transport) {
    console.log(
      `\n[mail:dev] to=${to}\n[mail:dev] subject=${subject}\n[mail:dev] ${text ?? ''}\n`,
    );
    return { delivered: false, logged: true };
  }

  try {
    await transport.sendMail({ from: env.mailFrom, to, subject, text, html });
    return { delivered: true, logged: false };
  } catch (err) {
    console.error('[mail] send failed:', err.message);
    return { delivered: false, logged: false, error: err.message };
  }
};
