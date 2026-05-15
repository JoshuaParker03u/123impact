import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

type Params = { params: Promise<{ id: string }> };

const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

function makeClients(cookieStore: Awaited<ReturnType<typeof cookies>>) {
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
  return { session, service };
}

async function requireOrgAdmin(service: any, userId: string, orgId: string) {
  const { data } = await service
    .from('organization_admins').select('role')
    .eq('organization_id', orgId).eq('user_id', userId).single();
  return data && ['owner', 'admin'].includes(data.role);
}

// GET /api/organizations/[id]/custom-domain
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: orgId } = await params;
  const cookieStore = await cookies();
  const { session, service } = makeClients(cookieStore);

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await requireOrgAdmin(service, user.id, orgId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data } = await service
    .from('org_custom_domains')
    .select('id, subdomain, dns_admin_email, status, ssl_expires_at, primary_color, banner_image_url, header_links, token_expires_at, verification_token')
    .eq('organization_id', orgId)
    .maybeSingle();

  return NextResponse.json(data ?? null);
}

// POST /api/organizations/[id]/custom-domain
// Body: { subdomain, dns_admin_email?, primary_color?, banner_image_url?, header_links? }
export async function POST(req: NextRequest, { params }: Params) {
  const { id: orgId } = await params;
  const cookieStore = await cookies();
  const { session, service } = makeClients(cookieStore);

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await requireOrgAdmin(service, user.id, orgId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: org } = await service.from('organizations').select('plan').eq('id', orgId).single();
  if (!org || org.plan === 'free') {
    return NextResponse.json({ error: 'Custom domains require a paid plan' }, { status: 403 });
  }

  const body = await req.json();
  const { subdomain, dns_admin_email, primary_color, banner_image_url, header_links } = body;

  if (!subdomain) return NextResponse.json({ error: 'subdomain is required' }, { status: 400 });

  const normalized = subdomain.trim().toLowerCase();
  if (!SUBDOMAIN_RE.test(normalized) || normalized.split('.').length < 2) {
    return NextResponse.json({ error: 'Invalid subdomain format. Must include at least one dot (e.g. events.yourorg.com)' }, { status: 400 });
  }
  // Reject root domains (exactly two parts like "org.com")
  if (normalized.split('.').length === 2) {
    return NextResponse.json({ error: 'Root domains are not supported. Use a subdomain (e.g. events.yourorg.com)' }, { status: 400 });
  }

  const verification_token = crypto.randomUUID();
  const token_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await service
    .from('org_custom_domains')
    .upsert({
      organization_id:    orgId,
      subdomain:          normalized,
      dns_admin_email:    dns_admin_email ?? null,
      verification_token,
      token_expires_at,
      status:             'setup_initiated',
      primary_color:      primary_color ?? null,
      banner_image_url:   banner_image_url ?? null,
      header_links:       header_links ?? [],
      updated_at:         new Date().toISOString(),
    }, { onConflict: 'organization_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH /api/organizations/[id]/custom-domain
// Update branding fields only (when already active)
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: orgId } = await params;
  const cookieStore = await cookies();
  const { session, service } = makeClients(cookieStore);

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await requireOrgAdmin(service, user.id, orgId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const allowed = ['primary_color', 'banner_image_url', 'header_links', 'dns_admin_email'];
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const { error } = await service
    .from('org_custom_domains')
    .update(updates)
    .eq('organization_id', orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/organizations/[id]/custom-domain
// Disconnects the custom domain, removes from Vercel project
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id: orgId } = await params;
  const cookieStore = await cookies();
  const { session, service } = makeClients(cookieStore);

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await requireOrgAdmin(service, user.id, orgId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: domain } = await service
    .from('org_custom_domains').select('subdomain, status')
    .eq('organization_id', orgId).maybeSingle();

  if (domain?.status === 'active' && domain.subdomain) {
    // Remove from Vercel project
    const projectId = process.env.VERCEL_PROJECT_ID;
    const teamId    = process.env.VERCEL_TEAM_ID;
    const token     = process.env.VERCEL_API_TOKEN;
    if (token && projectId) {
      const url = `https://api.vercel.com/v9/projects/${projectId}/domains/${domain.subdomain}${teamId ? `?teamId=${teamId}` : ''}`;
      await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
  }

  const { error } = await service
    .from('org_custom_domains').delete().eq('organization_id', orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
