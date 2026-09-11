import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// GET /api/auth/integrations/discord/callback
// Handles Discord's bot-authorization callback. No code exchange happens —
// the bot acts via a single global bot token, not a per-org access token —
// so this just records which guild the admin picked for this org.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const guildId = searchParams.get('guild_id');
  const state   = searchParams.get('state');
  const error   = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  if (error || !guildId || !state) {
    return NextResponse.redirect(`${appUrl}/admin/organizations?tab=integrations&error=discord_denied`);
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
  // writing anything. Without this, anyone who completes Discord's OAuth
  // consent could hand-craft state with any orgId and hijack that org's
  // Discord connection. Same pattern as the Eventbrite callback.
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
    return NextResponse.redirect(`${appUrl}/admin/organizations?tab=integrations&error=discord_denied`);
  }

  const { data: membership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.redirect(`${appUrl}/admin/organizations?tab=integrations&error=discord_denied`);
  }

  try {
    // Enforce: one Discord guild per org across all orgs
    const { data: existing } = await service
      .from('platform_connections')
      .select('organization_id')
      .eq('platform', 'discord')
      .eq('external_org_id', guildId)
      .neq('organization_id', orgId)
      .maybeSingle();

    if (existing) {
      return NextResponse.redirect(`${appUrl}/admin/organizations?tab=integrations&error=discord_already_connected`);
    }

    await service.from('platform_connections').upsert({
      organization_id: orgId,
      platform:        'discord',
      access_token:    null,
      external_org_id: guildId,
      connected_by:    user.id,
      connected_at:    new Date().toISOString(),
    }, { onConflict: 'organization_id,platform' });

    return NextResponse.redirect(`${appUrl}/admin/organizations?tab=integrations&connected=discord`);
  } catch {
    return NextResponse.redirect(`${appUrl}/admin/organizations?tab=integrations&error=discord_failed`);
  }
}
