import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { addOccurrences, countOccurrences, daysBetween, shiftDateByDays, type RecurrenceFrequency } from '@/lib/recurrence';

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

const VALID_FREQUENCIES: RecurrenceFrequency[] = ['weekly', 'biweekly', 'monthly'];

// POST /api/events/[id]/recur
// Turns an already-created event into the first occurrence of a series,
// generating additional copies (shifts + daily hours included) on the given
// frequency up to end_date, capped at MAX_OCCURRENCES. Each occurrence is a
// fully independent event afterward — this only runs once, at setup time,
// there is no ongoing generation.
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
  const body = await request.json().catch(() => ({}));
  const frequency = body.frequency as RecurrenceFrequency;
  const endDate = body.end_date as string;

  if (!VALID_FREQUENCIES.includes(frequency)) {
    return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 });
  }
  if (!endDate || typeof endDate !== 'string') {
    return NextResponse.json({ error: 'end_date is required' }, { status: 400 });
  }

  const { data: event } = await service
    .from('events')
    .select(`
      organization_id, title, description, date, end_date, time, location,
      image_url, event_format, online_url, is_shiftless, shiftless_capacity,
      attendee_enabled, attendee_capacity, speaker_enabled,
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

  if (!adminRow || !['owner', 'admin'].includes(adminRow.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (endDate <= event.date) {
    return NextResponse.json({ error: 'end_date must be after the event\'s date' }, { status: 400 });
  }

  const occurrenceCount = countOccurrences(event.date, endDate, frequency);
  if (occurrenceCount <= 1) {
    return NextResponse.json({ error: 'No additional occurrences fit before end_date' }, { status: 400 });
  }

  const seriesId = crypto.randomUUID();
  const spanDays = event.end_date ? daysBetween(event.date, event.end_date) : 0;
  const shifts = (event.shifts ?? []) as ShiftRow[];
  const dayHours = (event.event_day_hours ?? []) as DayHoursRow[];

  await service.from('events').update({ series_id: seriesId }).eq('id', eventId);

  let created = 0;
  for (let i = 1; i < occurrenceCount; i++) {
    const newDate = addOccurrences(event.date, frequency, i);
    const newEndDate = event.end_date ? shiftDateByDays(newDate, spanDays) : null;
    const newSlug = generateSlug(event.title, randomSuffix());

    const { data: newEvent, error: insertError } = await service
      .from('events')
      .insert({
        organization_id:    event.organization_id,
        event_id:            newSlug,
        title:                event.title,
        description:          event.description,
        date:                 newDate,
        end_date:             newEndDate,
        time:                 event.time,
        location:             event.location,
        image_url:            event.image_url,
        status:               'active',
        event_format:         event.event_format,
        online_url:           event.online_url,
        is_shiftless:         event.is_shiftless,
        shiftless_capacity:   event.shiftless_capacity,
        attendee_enabled:     event.attendee_enabled,
        attendee_capacity:    event.attendee_capacity,
        speaker_enabled:      event.speaker_enabled,
        series_id:            seriesId,
      })
      .select('id')
      .single();

    if (insertError || !newEvent) {
      return NextResponse.json(
        { error: insertError?.message ?? 'Failed to create occurrence', created },
        { status: 500 }
      );
    }

    if (shifts.length > 0) {
      await service.from('shifts').insert(shifts.map((s) => ({
        event_id:       newEvent.id,
        shift_id:       s.shift_id,
        name:           s.name,
        description:    s.description,
        start_time:     s.start_time,
        end_time:       s.end_time,
        capacity:       s.capacity,
        shift_date:     s.shift_date ? shiftDateByDays(newDate, daysBetween(event.date, s.shift_date)) : null,
        allow_waitlist: s.allow_waitlist,
        filled:         0,
      })));
    }

    if (dayHours.length > 0) {
      await service.from('event_day_hours').insert(dayHours.map((d) => ({
        event_id:   newEvent.id,
        event_date: shiftDateByDays(newDate, daysBetween(event.date, d.event_date)),
        start_time: d.start_time,
        end_time:   d.end_time,
      })));
    }

    created++;
  }

  return NextResponse.json({ series_id: seriesId, created, occurrence_count: occurrenceCount });
}

// Fields safe to blast across every future occurrence in a series without
// touching per-occurrence registration state (capacity/role flags are
// deliberately excluded — different occurrences can have different
// registrations already, so those stay edited one at a time).
const PROPAGATABLE_FIELDS = ['title', 'description', 'location', 'time', 'image_url', 'event_format', 'online_url'] as const;

// PATCH /api/events/[id]/recur
// Applies an edit to every other event in the same series whose date hasn't
// passed yet — the opt-in "apply to all future occurrences" action.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: eventId } = await params;
  const body = await request.json().catch(() => ({}));

  const { data: event } = await service
    .from('events')
    .select('organization_id, series_id')
    .eq('id', eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  if (!event.series_id) {
    return NextResponse.json({ error: 'This event is not part of a series' }, { status: 400 });
  }

  const { data: adminRow } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', event.organization_id)
    .eq('user_id', user.id)
    .single();

  if (!adminRow || !['owner', 'admin'].includes(adminRow.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  for (const field of PROPAGATABLE_FIELDS) {
    if (field in body) updates[field] = body[field];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No propagatable fields provided' }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: updated, error } = await service
    .from('events')
    .update(updates)
    .eq('series_id', event.series_id)
    .neq('id', eventId)
    .gte('date', today)
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ updated: updated?.length ?? 0 });
}
