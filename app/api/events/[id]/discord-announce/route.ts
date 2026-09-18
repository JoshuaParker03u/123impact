import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { sendChannelMessage, deleteChannelMessage } from '@/lib/discord/dm';
import { buildEventAnnouncement } from '@/lib/discord/announce';

type Params = { params: Promise<{ id: string }> };

// POST /api/events/[id]/discord-announce
// Posts a signup announcement for this event to the org's Discord
// announcement channel. Org owner/admin only; requires Discord connected
// with an announcement channel set (Settings -> Integrations). Can be
// called repeatedly (e.g. as a reminder) — nothing here is one-time.
export async function POST(req: NextRequest, { params }: Params) {
  const { id: eventId } = await params;
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

  const { data: event } = await service
    .from('events')
    .select('id, event_id, organization_id, title, description, date, end_date, time, location, discord_message_id')
    .eq('id', eventId)
    .single();
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

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

  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || '';
  // Bare /signup URL, same link used by QR codes and emails elsewhere — it
  // redirects to whichever role flow fits, rather than guessing one here.
  const signupUrl = `${origin}/events/${event.event_id}/signup`;
  const message = buildEventAnnouncement(event, signupUrl);

  // Clear out the previous announcement first so re-posting (e.g. after
  // editing the event) doesn't leave stale copies piling up in the channel.
  // Best-effort — a failure here (already deleted, channel changed since)
  // never blocks posting the new one.
  if (event.discord_message_id) {
    await deleteChannelMessage(connection.announcement_channel_id, event.discord_message_id).catch((e) => console.error('deleteChannelMessage error:', e));
  }

  const result = await sendChannelMessage(connection.announcement_channel_id, message);
  if (!result.success) {
    return NextResponse.json({ error: result.error ?? 'Failed to post to Discord' }, { status: 502 });
  }

  await service.from('events').update({ discord_message_id: result.messageId ?? null }).eq('id', eventId);

  return NextResponse.json({ success: true });
}
