import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
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

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

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

    await service.from('platform_connections').upsert({
      organization_id: orgId,
      platform:        'eventbrite',
      access_token,
      external_org_id: externalOrgId,
      connected_at:    new Date().toISOString(),
    }, { onConflict: 'organization_id,platform' });

    return NextResponse.redirect(`${appUrl}/admin/organizations?tab=integrations&connected=eventbrite`);
  } catch {
    return NextResponse.redirect(`${appUrl}/admin/organizations?tab=integrations&error=eventbrite_failed`);
  }
}
