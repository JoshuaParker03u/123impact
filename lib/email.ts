import { MailerSend, EmailParams as MSEmailParams, Sender, Recipient } from 'mailersend';

const mailerSend = new MailerSend({ apiKey: process.env.MAILERSEND_API_KEY! });

export interface EmailParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: {
    email: string;
    name?: string;
  };
}

function defaultSender(from?: EmailParams['from']) {
  return new Sender(
    from?.email ?? process.env.MAILERSEND_FROM_EMAIL!,
    from?.name  ?? process.env.MAILERSEND_FROM_NAME
  );
}

function toRecipients(to: string | string[]) {
  return (Array.isArray(to) ? to : [to]).map((email) => new Recipient(email));
}

export async function sendEmail({ to, subject, html, from }: EmailParams) {
  const params = new MSEmailParams()
    .setFrom(defaultSender(from))
    .setTo(toRecipients(to))
    .setSubject(subject)
    .setHtml(html);
  try {
    await mailerSend.email.send(params);
    return { success: true };
  } catch (error: any) {
    console.error('MailerSend error:', error);
    return { success: false, error: error.message ?? 'Unknown error' };
  }
}

export async function sendBulkEmail({ to, subject, html, bcc, from }: EmailParams & { bcc?: string[] }) {
  const primaryTo = Array.isArray(to) ? to[0] : to;
  const bccList   = bcc ?? (Array.isArray(to) ? to.slice(1) : []);
  const params = new MSEmailParams()
    .setFrom(defaultSender(from))
    .setTo([new Recipient(primaryTo)])
    .setBcc(bccList.map((email) => new Recipient(email)))
    .setSubject(subject)
    .setHtml(html);
  try {
    await mailerSend.email.send(params);
    return { success: true };
  } catch (error: any) {
    console.error('MailerSend bulk error:', error);
    return { success: false, error: error.message ?? 'Unknown error' };
  }
}
