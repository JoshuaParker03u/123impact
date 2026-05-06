import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

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

// Shared fetch logic reused by export route
export async function fetchOrgAnalytics(service: any, orgId: string) {
  // All events for this org
  const { data: events } = await service
    .from('events')
    .select('id, title, date')
    .eq('organization_id', orgId)
    .order('date', { ascending: true });

  if (!events || events.length === 0) {
    return { new_vs_returning: { new: 0, returning: 0 }, per_event: [], volunteer_base_over_time: [] };
  }

  const eventIds = events.map((e: any) => e.id);

  // All shifts for these events
  const { data: shifts } = await service
    .from('shifts')
    .select('id, event_id')
    .in('event_id', eventIds);

  const shiftToEvent: Record<string, string> = {};
  (shifts ?? []).forEach((s: any) => { shiftToEvent[s.id] = s.event_id; });
  const allShiftIds = Object.keys(shiftToEvent);

  if (allShiftIds.length === 0) {
    return { new_vs_returning: { new: 0, returning: 0 }, per_event: [], volunteer_base_over_time: [] };
  }

  // All registrations (volunteers only) across the org
  const { data: allRegs } = await service
    .from('volunteer_registrations')
    .select('id, email, shift_id, registered_at')
    .in('shift_id', allShiftIds)
    .eq('attendee_type', 'volunteer')
    .order('registered_at', { ascending: true });

  const regs = allRegs ?? [];

  // Build per-event registration lists
  const regsByEvent: Record<string, { email: string; registered_at: string }[]> = {};
  for (const reg of regs) {
    const eventId = shiftToEvent[reg.shift_id];
    if (!eventId) continue;
    if (!regsByEvent[eventId]) regsByEvent[eventId] = [];
    regsByEvent[eventId].push({ email: reg.email, registered_at: reg.registered_at });
  }

  // Compute new vs returning per event:
  // Process events in chronological order. Maintain a running set of "seen" emails.
  // An email is "returning" if it was in the seen set when it registered for this event.
  const seenEmails = new Set<string>();
  let totalNew = 0;
  let totalReturning = 0;

  const perEvent = events.map((event: any) => {
    const eventRegs = regsByEvent[event.id] ?? [];
    const emails    = [...new Set(eventRegs.map((r) => r.email))];
    let newCount = 0;
    let retCount = 0;

    for (const email of emails) {
      if (seenEmails.has(email)) {
        retCount++;
      } else {
        newCount++;
        seenEmails.add(email);
      }
    }

    totalNew       += newCount;
    totalReturning += retCount;

    return {
      event_id:  event.id,
      title:     event.title,
      date:      event.date,
      new:       newCount,
      returning: retCount,
    };
  });

  // Volunteer base size over time: running total of unique volunteers by month
  // Group by month, count distinct new emails per month, then compute running sum
  const monthMap: Record<string, Set<string>> = {};
  for (const reg of regs) {
    const month = reg.registered_at.substring(0, 7); // 'YYYY-MM'
    if (!monthMap[month]) monthMap[month] = new Set();
    monthMap[month].add(reg.email);
  }

  // Only count truly new volunteers per month (not ones already seen in prior months)
  const monthsSorted = Object.keys(monthMap).sort();
  const seenForTime  = new Set<string>();
  let runningTotal   = 0;

  const volunteerBaseOverTime = monthsSorted.map((month) => {
    let newThisMonth = 0;
    for (const email of monthMap[month]) {
      if (!seenForTime.has(email)) {
        seenForTime.add(email);
        newThisMonth++;
      }
    }
    runningTotal += newThisMonth;
    return { month, total: runningTotal };
  });

  return {
    new_vs_returning:        { new: totalNew, returning: totalReturning },
    per_event:               perEvent,
    volunteer_base_over_time: volunteerBaseOverTime,
  };
}

// GET /api/organizations/[id]/analytics
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: orgId } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: membership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const data = await fetchOrgAnalytics(service, orgId);
  return NextResponse.json(data);
}
