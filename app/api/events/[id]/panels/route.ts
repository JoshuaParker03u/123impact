import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

type Params = { params: Promise<{ id: string }> };

function buildServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function buildSessionClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
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
}

// GET /api/events/[id]/panels — public, includes live fill counts
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: eventId } = await params;
  const service = buildServiceClient();

  const { data, error } = await service
    .from('panels')
    .select('id, event_id, name, description, start_time, end_time, panel_date, location, online_url, capacity, allow_waitlist, created_at, updated_at')
    .eq('event_id', eventId)
    .order('start_time', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Counts every confirmed registration against the panel regardless of
  // attendee_type (attendee, promoted speaker, or volunteer staff) — matches
  // what POST /api/panel-registrations actually enforces (which has no
  // attendee_type filter either), so this "available"/"is_full" figure
  // can't drift from what a real signup attempt would encounter.
  const panelIds = (data ?? []).map((p) => p.id);
  const { data: regRows } = panelIds.length
    ? await service
        .from('volunteer_registrations')
        .select('panel_id, is_waitlisted')
        .in('panel_id', panelIds)
    : { data: [] as { panel_id: string; is_waitlisted: boolean }[] };

  const countMap = (regRows ?? []).reduce<Record<string, { filled: number; waitlisted: number }>>((acc, r) => {
    if (!acc[r.panel_id]) acc[r.panel_id] = { filled: 0, waitlisted: 0 };
    if (r.is_waitlisted) acc[r.panel_id].waitlisted++;
    else acc[r.panel_id].filled++;
    return acc;
  }, {});

  const enriched = (data ?? []).map((panel) => {
    const { filled = 0, waitlisted = 0 } = countMap[panel.id] ?? {};
    return {
      ...panel,
      filled,
      waitlisted,
      available: panel.capacity - filled,
      is_full:   filled >= panel.capacity,
    };
  });

  return NextResponse.json(enriched);
}

// POST /api/events/[id]/panels — create a panel. Org owner/admin only.
export async function POST(req: NextRequest, { params }: Params) {
  const { id: eventId } = await params;
  const cookieStore = await cookies();
  const session = await buildSessionClient(cookieStore);
  const service = buildServiceClient();

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
    .maybeSingle();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, start_time, end_time, panel_date, location, online_url, capacity, allow_waitlist } = body;

  if (!name || !start_time || !end_time || !capacity) {
    return NextResponse.json({ error: 'name, start_time, end_time, and capacity are required' }, { status: 400 });
  }

  const { data: panel, error } = await service
    .from('panels')
    .insert({
      event_id:       eventId,
      name,
      description:    description ?? null,
      start_time,
      end_time,
      panel_date:     panel_date ?? null,
      location:       location ?? null,
      online_url:     online_url ?? null,
      capacity,
      allow_waitlist: allow_waitlist ?? false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(panel, { status: 201 });
}
