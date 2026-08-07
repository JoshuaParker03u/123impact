import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// GET /api/users/me/speaker-invites
// Returns pending speaker invites addressed to the current user's account
// email — lets someone who already has an account accept straight from
// their dashboard instead of needing the emailed link. Speaker invites
// themselves stay account-optional; this is purely a convenience surface
// for people who happen to be signed in as the invited email.
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

  const { data, error } = await service
    .from('event_speaker_invites')
    .select('id, token, topic, session_time, expires_at, events!inner(id, event_id, title, date, location, organizations!inner(name, logo_url))')
    .eq('email', user.email.toLowerCase())
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('date', { foreignTable: 'events', ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const invites = (data ?? []).map((row: any) => ({
    id:           row.id,
    token:        row.token,
    topic:        row.topic,
    session_time: row.session_time,
    expires_at:   row.expires_at,
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

  return NextResponse.json(invites);
}
