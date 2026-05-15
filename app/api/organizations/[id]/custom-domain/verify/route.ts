import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import dns from 'dns';

type Params = { params: Promise<{ id: string }> };

const VERCEL_CNAME_TARGET = 'cname.vercel-dns.com';

async function addDomainToVercel(subdomain: string): Promise<void> {
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId    = process.env.VERCEL_TEAM_ID;
  const token     = process.env.VERCEL_API_TOKEN;
  if (!token || !projectId) throw new Error('Vercel API not configured');

  const url = `https://api.vercel.com/v10/projects/${projectId}/domains${teamId ? `?teamId=${teamId}` : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: subdomain }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // 409 = domain already added — not an error
    if (res.status !== 409) throw new Error((body as any).error?.message ?? `Vercel API error ${res.status}`);
  }
}

// POST /api/organizations/[id]/custom-domain/verify
// Performs DNS lookup for CNAME and TXT records, then adds domain to Vercel on success.
export async function POST(_req: NextRequest, { params }: Params) {
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

  const { data: domain } = await service
    .from('org_custom_domains').select('*').eq('organization_id', orgId).single();
  if (!domain) return NextResponse.json({ error: 'No custom domain configured' }, { status: 404 });

  const allowedStatuses = ['setup_initiated', 'email_sent', 'pending_verification', 'verification_failed'];
  if (!allowedStatuses.includes(domain.status)) {
    return NextResponse.json({ error: `Cannot verify from status: ${domain.status}` }, { status: 400 });
  }

  const errors: string[] = [];

  // Check CNAME
  let cnameOk = false;
  try {
    const cnames = await dns.promises.resolveCname(domain.subdomain);
    cnameOk = cnames.some((c: string) => c.toLowerCase().includes('vercel-dns.com') || c.toLowerCase().includes('vercel.app'));
    if (!cnameOk) errors.push(`CNAME points to "${cnames[0]}" — expected "cname.vercel-dns.com"`);
  } catch {
    errors.push('CNAME record not found');
  }

  // Check TXT
  let txtOk = false;
  try {
    const txts = await dns.promises.resolveTxt(`_123impact-verify.${domain.subdomain}`);
    txtOk = txts.flat().some((t: string) => t === domain.verification_token);
    if (!txtOk) errors.push('TXT verification record not found or incorrect');
  } catch {
    errors.push('TXT record (_123impact-verify.' + domain.subdomain + ') not found');
  }

  if (errors.length > 0) {
    await service.from('org_custom_domains').update({
      status:     'verification_failed',
      updated_at: new Date().toISOString(),
    }).eq('organization_id', orgId);
    return NextResponse.json({ success: false, errors }, { status: 422 });
  }

  // DNS OK — add to Vercel
  try {
    await addDomainToVercel(domain.subdomain);
  } catch (err: any) {
    return NextResponse.json({ success: false, errors: [`Vercel domain setup failed: ${err.message}`] }, { status: 500 });
  }

  const sslExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  await service.from('org_custom_domains').update({
    status:         'active',
    ssl_expires_at: sslExpiry,
    updated_at:     new Date().toISOString(),
  }).eq('organization_id', orgId);

  // In-app notifications for org owners + admins
  const { data: admins } = await service
    .from('organization_admins').select('user_id')
    .eq('organization_id', orgId).in('role', ['owner', 'admin']);

  if (admins && admins.length > 0) {
    await service.from('notifications').insert(
      admins.map((a: any) => ({
        user_id: a.user_id,
        type:    'custom_domain_active',
        title:   'Custom domain is live',
        body:    `${domain.subdomain} is now active. Event pages are being served under your subdomain.`,
        link:    '/admin/organizations?tab=custom-domain',
      }))
    );
  }

  return NextResponse.json({ success: true, subdomain: domain.subdomain });
}
