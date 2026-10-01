import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { eventbriteExchangeCode, eventbriteGetOrgId } from '@/lib/platforms/eventbrite';

// GET /api/auth/integrations/eventbrite/callback
// Handles Eventbrite OAuth callback. Exchanges code for token, stores connection.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  if (error || !code || !state) {
    return NextResponse.redirect(`${appUrl}/admin/organizations?tab=integrations&error=eventbrite_denied`);
  }

  let orgId: string;
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString());
    orgId = parsed.orgId;
    if (!orgId) throw new Error('Missing orgId');
  } catch {
    return NextResponse.redirect(`${appUrl}/admin/organizations?tab=integrations&error=invalid_state`);
  }

  // state isn't signed, so it's only a hint of intent — re-verify the
  // current caller actually has admin rights on the org it names before
  // writing anything. Without this, anyone who completes Eventbrite's OAuth
  // consent for their own account could hand-craft state with any orgId and
  // hijack that org's Eventbrite connection.
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
  if (!user) {
    return NextResponse.redirect(`${appUrl}/admin/organizations?tab=integrations&error=eventbrite_denied`);
  }

  const { data: membership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.redirect(`${appUrl}/admin/organizations?tab=integrations&error=eventbrite_denied`);
  }

  try {
    const { access_token } = await eventbriteExchangeCode(code);
    const externalOrgId = await eventbriteGetOrgId(access_token);

    // Enforce: one Eventbrite account per org across all orgs
    const { data: existing } = await service
      .from('platform_connections')
      .select('organization_id')
      .eq('platform', 'eventbrite')
      .eq('external_org_id', externalOrgId)
      .neq('organization_id', orgId)
      .maybeSingle();

    if (existing) {
      return NextResponse.redirect(`${appUrl}/admin/organizations?tab=integrations&error=eventbrite_already_connected`);
    }

    const { error: upsertError } = await service.from('platform_connections').upsert({
      organization_id: orgId,
      platform:        'eventbrite',
      access_token,
      external_org_id: externalOrgId,
      connected_at:    new Date().toISOString(),
    }, { onConflict: 'organization_id,platform' });

    if (upsertError) {
      // 23505 here means another org's connection attempt for this same
      // account won the race against the check above — rare, but the
      // unique index on (platform, external_org_id) catches what that
      // check alone can't.
      const errorCode = upsertError.code === '23505' ? 'eventbrite_already_connected' : 'eventbrite_failed';
      return NextResponse.redirect(`${appUrl}/admin/organizations?tab=integrations&error=${errorCode}`);
    }

    return NextResponse.redirect(`${appUrl}/admin/organizations?tab=integrations&connected=eventbrite`);
  } catch {
    return NextResponse.redirect(`${appUrl}/admin/organizations?tab=integrations&error=eventbrite_failed`);
  }
}
