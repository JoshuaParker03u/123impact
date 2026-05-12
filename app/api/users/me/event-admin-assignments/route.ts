import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// GET /api/users/me/event-admin-assignments
// Returns active Event Admin assignments for the current user, with event + org details.
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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await service
    .from('event_admin_assignments')
    .select('id, expires_at, events!inner(id, event_id, title, date, location, organizations!inner(name, logo_url))')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const assignments = (data ?? []).map((row: any) => ({
    id:         row.id,
    expires_at: row.expires_at,
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

  return NextResponse.json(assignments);
}
