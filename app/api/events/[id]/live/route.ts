import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

type Params = { params: Promise<{ id: string }> };

// GET /api/events/[id]/live
// Day-of live dashboard data. Auth: org admin or active event admin.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: eventId } = await params;

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

  const { data: event } = await service
    .from('events')
    .select('id, organization_id, date')
    .eq('id', eventId)
    .single();
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const { data: orgMembership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', event.organization_id)
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: eventAdmin } = await service
    .from('event_admin_assignments')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (!(orgMembership && ['owner', 'admin'].includes(orgMembership.role)) && !eventAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch all registrations for this event's shifts
  const { data: shifts } = await service
    .from('shifts')
    .select('id')
    .eq('event_id', eventId);

  const shiftIds = (shifts ?? []).map((s: any) => s.id);

  if (shiftIds.length === 0) {
    return NextResponse.json({
      checked_in_count: 0,
      total_registered: 0,
      pct: 0,
      by_type: {
        volunteer: { registered: 0, checked_in: 0 },
        attendee:  { registered: 0, checked_in: 0 },
        speaker:   { registered: 0, checked_in: 0 },
      },
      speakers: [],
    });
  }

  const { data: regs } = await service
    .from('volunteer_registrations')
    .select('id, name, attendee_type')
    .in('shift_id', shiftIds);

  const allRegs = regs ?? [];
  const regIds  = allRegs.map((r: any) => r.id);

  const { data: checkIns } = await service
    .from('check_ins')
    .select('registration_id, checked_in_at')
    .in('registration_id', regIds);

  const checkInMap: Record<string, string> = {};
  (checkIns ?? []).forEach((c: any) => { checkInMap[c.registration_id] = c.checked_in_at; });

  type TypeKey = 'volunteer' | 'attendee' | 'speaker';
  const byType: Record<TypeKey, { registered: number; checked_in: number }> = {
    volunteer: { registered: 0, checked_in: 0 },
    attendee:  { registered: 0, checked_in: 0 },
    speaker:   { registered: 0, checked_in: 0 },
  };

  const speakers: { name: string; checked_in: boolean; checked_in_at: string | null }[] = [];

  for (const reg of allRegs) {
    const type = (reg.attendee_type ?? 'volunteer') as TypeKey;
    if (type in byType) {
      byType[type].registered++;
      if (checkInMap[reg.id]) byType[type].checked_in++;
    }
    if (type === 'speaker') {
      speakers.push({
        name:         reg.name,
        checked_in:   !!checkInMap[reg.id],
        checked_in_at: checkInMap[reg.id] ?? null,
      });
    }
  }

  const total      = allRegs.length;
  const checkedIn  = Object.keys(checkInMap).filter((id) => regIds.includes(id)).length;
  const pct        = total > 0 ? Math.round((checkedIn / total) * 100) : 0;

  return NextResponse.json({
    checked_in_count: checkedIn,
    total_registered: total,
    pct,
    by_type: byType,
    speakers: speakers.sort((a, b) => a.name.localeCompare(b.name)),
  });
}
