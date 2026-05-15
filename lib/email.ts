import { MailerSend, EmailParams as MSEmailParams, Sender, Recipient } from 'mailersend';
import type { SupabaseClient } from '@supabase/supabase-js';

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

export interface BulkEmailRecipient {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  from?: EmailParams['from'];
}

// Filters a list of emails against the opt-out blocklist. Use before any bulk send.
export async function filterOptedOut(service: SupabaseClient, emails: string[]): Promise<string[]> {
  const lower = emails.map(e => e.toLowerCase());
  const { data } = await service
    .from('email_optouts')
    .select('email')
    .in('email', lower);
  const blocked = new Set((data ?? []).map((r: any) => r.email as string));
  return emails.filter(e => !blocked.has(e.toLowerCase()));
}

// Sends personalized emails to many recipients in a single API call via
// MailerSend's /v1/bulk-email endpoint. Returns a bulk_id for status polling.
// Delivery is async — do not rely on immediate confirmation.
export async function sendBulkEmail(recipients: BulkEmailRecipient[]) {
  const paramsList = recipients.map(({ to, toName, subject, html, from }) =>
    new MSEmailParams()
      .setFrom(defaultSender(from))
      .setTo([new Recipient(to, toName)])
      .setSubject(subject)
      .setHtml(html)
  );
  try {
    const response = await mailerSend.email.sendBulk(paramsList);
    const bulkId = (response as any)?.body?.bulk_email_id ?? null;
    return { success: true, bulkId };
  } catch (error: any) {
    console.error('MailerSend bulk error:', error);
    return { success: false, bulkId: null, error: error.message ?? 'Unknown error' };
  }
}
