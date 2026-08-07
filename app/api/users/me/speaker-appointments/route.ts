import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// GET /api/users/me/speaker-appointments
// Returns upcoming speaking engagements for the current user — matched by
// account email against event_speaker_invites, since speaker signups don't
// require an account (or even a login) to complete. A visitor only sees
// this if they're signed in with the same email the invite was sent to.
//
// Queries the invite rather than volunteer_registrations directly — every
// accepted speaker registration has exactly one accepted invite pointing at
// it (registrations are only ever created via the invite-accept endpoint),
// and the invite is also where topic/session_time live.
export async function GET() {
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
  if (!user || !user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await service
    .from('event_speaker_invites')
    .select('id, topic, session_time, events!inner(id, event_id, title, date, location, organizations!inner(name, logo_url))')
    .eq('status', 'accepted')
    .eq('email', user.email.toLowerCase())
    .gte('events.date', today)
    .order('date', { foreignTable: 'events', ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const appointments = (data ?? []).map((row: any) => ({
    id:           row.id,
    topic:        row.topic,
    session_time: row.session_time,
    event: {
      id:       row.events.id,
      event_id: row.events.event_id,
      title:    row.events.title,
      date:     row.events.date,
      location: row.events.location,
    },
    org: {
      name:     row.events.organizations.name,
      logo_url: row.events.organizations.logo_url,
    },
  }));

  return NextResponse.json(appointments);
}
