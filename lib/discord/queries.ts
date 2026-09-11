import { createClient } from '@supabase/supabase-js';

function buildServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function todayStr(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

export interface DiscordConnection {
  organization_id: string;
  channel_id: string | null;
}

export async function getConnectionByGuildId(guildId: string): Promise<DiscordConnection | null> {
  const supabase = buildServiceClient();
  const { data } = await supabase
    .from('platform_connections')
    .select('organization_id, channel_id')
    .eq('platform', 'discord')
    .eq('external_org_id', guildId)
    .maybeSingle();
  return data ?? null;
}

export interface UpcomingEvent {
  id: string;
  title: string;
  date: string;
  end_date: string | null;
  is_shiftless: boolean;
  attendee_enabled: boolean;
}

// Mirrors SignupPageClient.tsx's local-date-string comparison — comparing
// plain "YYYY-MM-DD" strings directly avoids new Date() parsing an event's
// date as UTC midnight, which would shift closed events a day too early in
// timezones behind UTC.
export async function getUpcomingEventsForOrg(orgId: string): Promise<UpcomingEvent[]> {
  const supabase = buildServiceClient();
  const { data } = await supabase
    .from('events')
    .select('id, title, date, end_date, is_shiftless, attendee_enabled')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .order('date', { ascending: true });

  const today = todayStr();
  return (data ?? [])
    .filter((e) => (e.end_date ?? e.date) >= today)
    .slice(0, 25); // Discord select-menu option limit
}

export interface EventFlags {
  id: string;
  title: string;
  is_shiftless: boolean;
  attendee_enabled: boolean;
}

export async function getEventById(eventId: string): Promise<EventFlags | null> {
  const supabase = buildServiceClient();
  const { data } = await supabase
    .from('events')
    .select('id, title, is_shiftless, attendee_enabled')
    .eq('id', eventId)
    .single();
  return data ?? null;
}

export interface OpenShift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  available: number;
  is_full: boolean;
  allow_waitlist: boolean;
}

export async function getOpenShiftsForEvent(eventId: string): Promise<OpenShift[]> {
  const supabase = buildServiceClient();
  const { data: shifts } = await supabase
    .from('shifts')
    .select('id, name, start_time, end_time, capacity, allow_waitlist')
    .eq('event_id', eventId)
    .order('start_time', { ascending: true });

  if (!shifts || shifts.length === 0) return [];

  const shiftIds = shifts.map((s) => s.id);
  const { data: regRows } = await supabase
    .from('volunteer_registrations')
    .select('shift_id, is_waitlisted')
    .in('shift_id', shiftIds)
    .eq('is_waitlisted', false);

  const filledMap = (regRows ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.shift_id] = (acc[r.shift_id] ?? 0) + 1;
    return acc;
  }, {});

  return shifts
    .map((s) => {
      const filled = filledMap[s.id] ?? 0;
      const is_full = filled >= s.capacity;
      return {
        id: s.id,
        name: s.name,
        start_time: s.start_time,
        end_time: s.end_time,
        available: Math.max(s.capacity - filled, 0),
        is_full,
        allow_waitlist: s.allow_waitlist,
      };
    })
    .filter((s) => !s.is_full || s.allow_waitlist)
    .slice(0, 25);
}
