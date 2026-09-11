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
//
// When discordUserId is given, RSVP-only events (no shifts) that this
// account already registered for are dropped from the list — there's
// nothing further to sign up for there. Shift-based events are always kept
// even if the user already has one shift there, since they may want a
// different shift; already-claimed shifts are filtered at selection time
// instead (see getOpenShiftsForEvent).
export async function getUpcomingEventsForOrg(orgId: string, discordUserId?: string | null): Promise<UpcomingEvent[]> {
  const supabase = buildServiceClient();
  const { data } = await supabase
    .from('events')
    .select('id, title, date, end_date, is_shiftless, attendee_enabled')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .order('date', { ascending: true });

  const today = todayStr();
  const upcoming = (data ?? []).filter((e) => (e.end_date ?? e.date) >= today);

  if (!discordUserId || upcoming.length === 0) return upcoming.slice(0, 25);

  const eventIds = upcoming.map((e) => e.id);
  const [{ data: shiftRows }, { data: rsvpRows }] = await Promise.all([
    supabase.from('shifts').select('event_id').in('event_id', eventIds),
    supabase
      .from('volunteer_registrations')
      .select('event_id')
      .is('shift_id', null)
      .eq('discord_user_id', discordUserId)
      .in('event_id', eventIds),
  ]);

  const eventsWithShifts = new Set((shiftRows ?? []).map((s) => s.event_id));
  const alreadyRsvped = new Set((rsvpRows ?? []).map((r) => r.event_id));

  return upcoming
    .filter((e) => eventsWithShifts.has(e.id) || !alreadyRsvped.has(e.id))
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

export interface ShiftsForEvent {
  shifts: OpenShift[];
  // Whether the event has any shifts defined at all, regardless of
  // availability — lets callers tell "no shifts exist" (an RSVP-style
  // event) apart from "shifts exist but none are available to this user
  // right now" (full, or already claimed by this Discord account).
  hasAnyShifts: boolean;
}

export async function getOpenShiftsForEvent(eventId: string, discordUserId?: string | null): Promise<ShiftsForEvent> {
  const supabase = buildServiceClient();
  const { data: shifts } = await supabase
    .from('shifts')
    .select('id, name, start_time, end_time, capacity, allow_waitlist')
    .eq('event_id', eventId)
    .order('start_time', { ascending: true });

  if (!shifts || shifts.length === 0) return { shifts: [], hasAnyShifts: false };

  const shiftIds = shifts.map((s) => s.id);
  const [{ data: regRows }, { data: claimedRows }] = await Promise.all([
    supabase
      .from('volunteer_registrations')
      .select('shift_id, is_waitlisted')
      .in('shift_id', shiftIds)
      .eq('is_waitlisted', false),
    discordUserId
      ? supabase
          .from('volunteer_registrations')
          .select('shift_id')
          .in('shift_id', shiftIds)
          .eq('discord_user_id', discordUserId)
      : Promise.resolve({ data: [] as { shift_id: string }[] }),
  ]);

  const filledMap = (regRows ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.shift_id] = (acc[r.shift_id] ?? 0) + 1;
    return acc;
  }, {});
  const claimedByUser = new Set((claimedRows ?? []).map((r) => r.shift_id));

  const filtered = shifts
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
    .filter((s) => (!s.is_full || s.allow_waitlist) && !claimedByUser.has(s.id))
    .slice(0, 25);

  return { shifts: filtered, hasAnyShifts: true };
}
