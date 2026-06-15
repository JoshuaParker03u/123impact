import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

async function buildClients() {
  const cookieStore = await cookies();
  const session = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
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

const TITLE_MAX = 75;

function generateSlug(title: string, suffix: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
  return base ? `${base}-${suffix}` : suffix;
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 6);
}

interface ShiftRow {
  shift_id: number;
  name: string;
  description: string | null;
  start_time: string;
  end_time: string;
  capacity: number;
  shift_date: string | null;
  allow_waitlist: boolean;
}

interface DayHoursRow {
  event_date: string;
  start_time: string;
  end_time: string;
}

// POST /api/events/[id]/duplicate
// Creates a copy of an event (and its shifts + daily hours) with no
// registrations, check-ins, or external-sync state carried over.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: eventId } = await params;

  const { data: event } = await service
    .from('events')
    .select(`
      organization_id, title, description, date, end_date, time, location,
      image_url, event_format, online_url, is_shiftless, shiftless_capacity,
      shifts (shift_id, name, description, start_time, end_time, capacity, shift_date, allow_waitlist),
      event_day_hours (event_date, start_time, end_time)
    `)
    .eq('id', eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const { data: adminRow } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', event.organization_id)
    .eq('user_id', user.id)
    .single();

  if (!adminRow) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const newTitle = `${event.title} (Copy)`.slice(0, TITLE_MAX);
  const newSlug = generateSlug(newTitle, randomSuffix());

  const { data: newEvent, error: insertError } = await service
    .from('events')
    .insert({
      organization_id: event.organization_id,
      event_id: newSlug,
      title: newTitle,
      description: event.description,
      date: event.date,
      end_date: event.end_date,
      time: event.time,
      location: event.location,
      image_url: event.image_url,
      status: 'active',
      event_format: event.event_format,
      online_url: event.online_url,
      is_shiftless: event.is_shiftless,
      shiftless_capacity: event.shiftless_capacity,
    })
    .select('id, event_id')
    .single();

  if (insertError || !newEvent) {
    return NextResponse.json({ error: insertError?.message ?? 'Failed to create event' }, { status: 500 });
  }

  const shifts = (event.shifts ?? []) as ShiftRow[];
  if (shifts.length > 0) {
    const { error: shiftsError } = await service
      .from('shifts')
      .insert(shifts.map((s) => ({
        event_id: newEvent.id,
        shift_id: s.shift_id,
        name: s.name,
        description: s.description,
        start_time: s.start_time,
        end_time: s.end_time,
        capacity: s.capacity,
        shift_date: s.shift_date,
        allow_waitlist: s.allow_waitlist,
        filled: 0,
      })));
    if (shiftsError) {
      return NextResponse.json({ error: shiftsError.message }, { status: 500 });
    }
  }

  const dayHours = (event.event_day_hours ?? []) as DayHoursRow[];
  if (dayHours.length > 0) {
    const { error: dayHoursError } = await service
      .from('event_day_hours')
      .insert(dayHours.map((d) => ({
        event_id: newEvent.id,
        event_date: d.event_date,
        start_time: d.start_time,
        end_time: d.end_time,
      })));
    if (dayHoursError) {
      return NextResponse.json({ error: dayHoursError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ id: newEvent.id, event_id: newEvent.event_id });
}
