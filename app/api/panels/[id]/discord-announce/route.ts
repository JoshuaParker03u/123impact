import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { sendChannelMessage } from '@/lib/discord/dm';
import { buildPanelAnnouncement } from '@/lib/discord/announce';

type Params = { params: Promise<{ id: string }> };

// POST /api/panels/[id]/discord-announce
// Posts a signup announcement for this panel to the org's Discord
// announcement channel, deep-linking into the event's attendee signup page
// with this panel preselected. Org owner/admin only.
export async function POST(req: NextRequest, { params }: Params) {
  const { id: panelId } = await params;
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

  const { data: panel } = await service
    .from('panels')
    .select('id, name, description, start_time, end_time, panel_date, location, capacity, allow_waitlist, events!inner(id, event_id, title, organization_id)')
    .eq('id', panelId)
    .single();
  if (!panel) return NextResponse.json({ error: 'Panel not found' }, { status: 404 });

  const event = (panel as any).events as { id: string; event_id: string; title: string; organization_id: string };

  const { data: membership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', event.organization_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: connection } = await service
    .from('platform_connections')
    .select('announcement_channel_id')
    .eq('organization_id', event.organization_id)
    .eq('platform', 'discord')
    .maybeSingle();

  if (!connection?.announcement_channel_id) {
    return NextResponse.json({ error: 'No Discord announcement channel set — configure one in Settings → Integrations' }, { status: 400 });
  }

  // Same count as app/api/events/[id]/panels/route.ts — every confirmed
  // registration regardless of type, matching real signup enforcement, so
  // the "spots left" figure can't drift from what a signup attempt sees.
  const { count } = await service
    .from('volunteer_registrations')
    .select('*', { count: 'exact', head: true })
    .eq('panel_id', panelId)
    .eq('is_waitlisted', false);

  const available = panel.capacity - (count ?? 0);

  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || '';
  const signupUrl = `${origin}/events/${event.event_id}/signup/attendee?panel=${panel.id}`;
  const message = buildPanelAnnouncement({ ...panel, available }, event.title, signupUrl);

  const result = await sendChannelMessage(connection.announcement_channel_id, message);
  if (!result.success) {
    return NextResponse.json({ error: result.error ?? 'Failed to post to Discord' }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
