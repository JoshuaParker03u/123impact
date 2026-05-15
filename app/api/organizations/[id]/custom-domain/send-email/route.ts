import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { sendEmail } from '@/lib/email';
import { wrapEmailHtml } from '@/lib/email-templates';

type Params = { params: Promise<{ id: string }> };

// POST /api/organizations/[id]/custom-domain/send-email
// Sends DNS setup instructions to the DNS admin email.
export async function POST(req: NextRequest, { params }: Params) {
  const { id: orgId } = await params;
  const cookieStore = await cookies();
  const session = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
        },
      },
    }
  );
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: membership } = await service
    .from('organization_admins').select('role')
    .eq('organization_id', orgId).eq('user_id', user.id).single();
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  const { data: domain } = await service
    .from('org_custom_domains').select('*')
    .eq('organization_id', orgId).single();
  if (!domain) return NextResponse.json({ error: 'No custom domain configured' }, { status: 404 });

  // Allow updating dns_admin_email before resending
  const recipientEmail = body.dns_admin_email ?? domain.dns_admin_email;
  if (!recipientEmail) return NextResponse.json({ error: 'dns_admin_email is required' }, { status: 400 });

  const { data: org } = await service.from('organizations').select('name').eq('id', orgId).single();
  const orgName = (org as any)?.name ?? 'An organization';

  // Regenerate token
  const verification_token = crypto.randomUUID();
  const token_expires_at   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await service.from('org_custom_domains').update({
    verification_token,
    token_expires_at,
    dns_admin_email: recipientEmail,
    status: 'email_sent',
    updated_at: new Date().toISOString(),
  }).eq('organization_id', orgId);

  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://123impact.org';
  const verifyUrl = `${appUrl}/verify-domain/${verification_token}`;

  const html = wrapEmailHtml(`
    <h2>DNS Setup Instructions</h2>
    <p>${orgName} is setting up event pages at <strong>${domain.subdomain}</strong> using 123impact.</p>
    <p>Please add the following records to your DNS provider:</p>

    <table style="width:100%;border-collapse:collapse;margin:20px 0;font-family:monospace;">
      <tr style="background:#f3f4f6;">
        <th style="padding:10px;text-align:left;font-size:12px;color:#6b7280;">Type</th>
        <th style="padding:10px;text-align:left;font-size:12px;color:#6b7280;">Name</th>
        <th style="padding:10px;text-align:left;font-size:12px;color:#6b7280;">Value</th>
      </tr>
      <tr>
        <td style="padding:10px;border-top:1px solid #e5e7eb;">CNAME</td>
        <td style="padding:10px;border-top:1px solid #e5e7eb;">${domain.subdomain}</td>
        <td style="padding:10px;border-top:1px solid #e5e7eb;">cname.vercel-dns.com</td>
      </tr>
      <tr>
        <td style="padding:10px;border-top:1px solid #e5e7eb;">TXT</td>
        <td style="padding:10px;border-top:1px solid #e5e7eb;">_123impact-verify.${domain.subdomain}</td>
        <td style="padding:10px;border-top:1px solid #e5e7eb;">${verification_token}</td>
      </tr>
    </table>

    <p style="color:#6b7280;font-size:14px;">DNS changes can take up to 48 hours to propagate.</p>

    <p>Once you've added the records, click the button below to verify:</p>
    <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;text-decoration:none;border-radius:8px;font-weight:600;">Verify DNS Records</a></p>
    <p style="color:#9ca3af;font-size:12px;">This link expires in 7 days. If it expires, ask ${orgName} to resend the instructions.</p>
  `);

  await sendEmail({
    to: recipientEmail,
    subject: `DNS setup required: ${domain.subdomain}`,
    html,
  });

  return NextResponse.json({ success: true });
}
