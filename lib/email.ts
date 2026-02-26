import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export interface EmailParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: {
    email: string;
    name: string;
  };
}

export async function sendEmail(params: EmailParams) {
  const { to, subject, html, from } = params;
  
  const msg = {
    to: Array.isArray(to) ? to : [to],
    from: from || {
      email: process.env.SENDGRID_FROM_EMAIL!,
      name: process.env.SENDGRID_FROM_NAME!,
    },
    subject,
    html,
  };

  try {
    await sgMail.send(msg);
    return { success: true };
  } catch (error: any) {
    console.error('Email send error:', error);
    return { 
      success: false, 
      error: error?.response?.body?.errors?.[0]?.message || error.message 
    };
  }
}

export async function sendBulkEmail(params: EmailParams & { bcc?: string[] }) {
  const { to, subject, html, from, bcc } = params;
  
  const msg = {
    to: Array.isArray(to) ? to[0] : to,
    bcc: bcc || (Array.isArray(to) ? to.slice(1) : []),
    from: from || {
      email: process.env.SENDGRID_FROM_EMAIL!,
      name: process.env.SENDGRID_FROM_NAME!,
    },
    subject,
    html,
  };

  try {
    await sgMail.send(msg);
    return { success: true };
  } catch (error: any) {
    console.error('Bulk email send error:', error);
    return { 
      success: false, 
      error: error?.response?.body?.errors?.[0]?.message || error.message 
    };
  }
}
