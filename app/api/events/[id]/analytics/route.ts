import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { shiftDurationHours } from '@/lib/hours';

type Params = { params: Promise<{ id: string }> };

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

async function requireAccess(service: any, eventId: string, userId: string) {
  const { data: event } = await service
    .from('events')
    .select('id, organization_id, date, event_format')
    .eq('id', eventId)
    .single();
  if (!event) return { error: 'Event not found', status: 404 };

  const { data: orgMembership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', event.organization_id)
    .eq('user_id', userId)
    .maybeSingle();

  const { data: eventAdmin } = await service
    .from('event_admin_assignments')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  const isAdmin = orgMembership && ['owner', 'admin'].includes(orgMembership.role);
  if (!isAdmin && !eventAdmin) return { error: 'Forbidden', status: 403 };
  return { event };
}

// Shared data-fetch used by both GET and CSV export
export async function fetchAnalyticsData(service: any, eventId: string) {
  const { data: event } = await service
    .from('events')
    .select('id, title, organization_id, date, event_format')
    .eq('id', eventId)
    .single();

  if (!event) return null;

  // All registrations for this event, regardless of anchor (shift, panel, or
  // unanchored/shiftless) — event_id is populated on every registration row
  // no matter which anchor it has, so this is the one query that can't
  // silently exclude a whole category the way a shift_id-first join would.
  const { data: regs } = await service
    .from('volunteer_registrations')
    .select('id, email, attendee_type, registered_at, shift_id, shifts (start_time, end_time)')
    .eq('event_id', eventId);

  const allRegs = regs ?? [];
  if (allRegs.length === 0) {
    return {
      event,
      total_registrations: 0,
      by_attendee_type: { volunteer: 0, attendee: 0, speaker: 0 },
      check_in_summary: { checked_in: 0, not_checked_in: 0 },
      no_show_rate: 0,
      new_count: 0,
      returning_count: 0,
      total_hours: 0,
      registrations: [],
    };
  }

  const regIds = allRegs.map((r: any) => r.id);

  // Check-ins for these registrations
  const { data: checkIns } = await service
    .from('check_ins')
    .select('registration_id, checked_in_at')
    .in('registration_id', regIds);

  const checkedInSet = new Set((checkIns ?? []).map((c: any) => c.registration_id));

  // New vs Returning: find all emails that have registrations in OTHER events
  // for this org with registered_at earlier than the earliest reg for this event
  const emails = [...new Set(allRegs.map((r: any) => r.email as string))];
  const earliestRegDate = allRegs.reduce((min: string, r: any) =>
    r.registered_at < min ? r.registered_at : min,
    allRegs[0]?.registered_at ?? new Date().toISOString()
  );

  let returningEmails = new Set<string>();
  if (emails.length > 0) {
    // Get all registrations for this org's OTHER events, before this event's
    // first registration — via event_id directly so a panel or shiftless
    // registration on a prior event still counts as a "returning" signal.
    const { data: otherEvents } = await service
      .from('events')
      .select('id')
      .eq('organization_id', event.organization_id)
      .neq('id', eventId);

    const otherEventIds = (otherEvents ?? []).map((e: any) => e.id);

    if (otherEventIds.length > 0) {
      const { data: priorRegs } = await service
        .from('volunteer_registrations')
        .select('email')
        .in('event_id', otherEventIds)
        .in('email', emails)
        .lt('registered_at', earliestRegDate);

      (priorRegs ?? []).forEach((r: any) => returningEmails.add(r.email));
    }
  }

  // Build per-registration result
  const byType = { volunteer: 0, attendee: 0, speaker: 0 };
  const registrations = allRegs.map((r: any) => {
    const type = r.attendee_type as keyof typeof byType;
    if (type in byType) byType[type]++;
    const checkedIn = checkedInSet.has(r.id);
    return {
      id:           r.id,
      attendee_type: r.attendee_type,
      checked_in:   checkedIn,
      is_returning: returningEmails.has(r.email),
      hours:        type === 'volunteer' && checkedIn ? shiftDurationHours(r.shifts?.start_time, r.shifts?.end_time) : 0,
    };
  });

  type RegRow = { id: string; attendee_type: string; checked_in: boolean; is_returning: boolean };
  const checkedInCount   = registrations.filter((r: RegRow) => r.checked_in).length;
  const total            = registrations.length;
  const noShowRate       = total > 0 ? Math.round(((total - checkedInCount) / total) * 100) : 0;
  const returningCount   = registrations.filter((r: RegRow) => r.is_returning).length;
  const newCount         = total - returningCount;

  // Hours only count for checked-in Volunteer registrations — shift time is
  // the only reliable scheduled-duration source in this app.
  const totalHours = registrations.reduce((sum: number, r: { hours: number }) => sum + r.hours, 0);

  return {
    event,
    total_registrations: total,
    by_attendee_type:    byType,
    check_in_summary:    { checked_in: checkedInCount, not_checked_in: total - checkedInCount },
    no_show_rate:        noShowRate,
    new_count:           newCount,
    returning_count:     returningCount,
    total_hours:         Math.round(totalHours * 100) / 100,
    registrations,
  };
}

// GET /api/events/[id]/analytics
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: eventId } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const check = await requireAccess(service, eventId, user.id);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status as number });

  const data = await fetchAnalyticsData(service, eventId);
  if (!data) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  return NextResponse.json(data);
}
