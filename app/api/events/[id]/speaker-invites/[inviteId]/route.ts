import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

type Params = { params: Promise<{ id: string; inviteId: string }> };

async function buildClients() {
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
  return { session, service };
}

// PATCH /api/events/[id]/speaker-invites/[inviteId] — edit the speaker's
// bio/topic (the registration created when they accepted — only possible
// once accepted) and/or the host-scheduled session time (available any
// time, accepted or not — scheduling doesn't depend on the speaker having
// confirmed yet).
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: eventId, inviteId } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: event } = await service
    .from('events')
    .select('organization_id')
    .eq('id', eventId)
    .single();
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const { data: membership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', event.organization_id)
    .eq('user_id', user.id)
    .single();
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: invite } = await service
    .from('event_speaker_invites')
    .select('registration_id')
    .eq('id', inviteId)
    .eq('event_id', eventId)
    .single();
  if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 });

  const body = await req.json();
  const { speaker_bio, speaker_topic, session_time } = body;

  if (speaker_bio !== undefined || speaker_topic !== undefined) {
    if (!invite.registration_id) {
      return NextResponse.json({ error: 'This invite has not been accepted yet' }, { status: 400 });
    }

    const { error } = await service
      .from('volunteer_registrations')
      .update({
        speaker_bio: speaker_bio?.trim() || null,
        speaker_topic: speaker_topic?.trim() || null,
      })
      .eq('id', invite.registration_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Keep the invite's own topic in sync — the duplicate-invite check in
    // the POST handler compares against this column, so a stale value here
    // would let a genuinely duplicate talk slip through (or wrongly block a
    // new one).
    await service
      .from('event_speaker_invites')
      .update({ topic: speaker_topic?.trim() || null })
      .eq('id', inviteId);
  }

  if (session_time !== undefined) {
    if (session_time && !/^\d{2}:\d{2}$/.test(session_time)) {
      return NextResponse.json({ error: 'Invalid session time' }, { status: 400 });
    }

    const { error } = await service
      .from('event_speaker_invites')
      .update({ session_time: session_time || null, updated_at: new Date().toISOString() })
      .eq('id', inviteId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/events/[id]/speaker-invites/[inviteId] — revoke invite
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id: eventId, inviteId } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: event } = await service
    .from('events')
    .select('organization_id')
    .eq('id', eventId)
    .single();
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const { data: membership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', event.organization_id)
    .eq('user_id', user.id)
    .single();
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await service
    .from('event_speaker_invites')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('id', inviteId)
    .eq('event_id', eventId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
