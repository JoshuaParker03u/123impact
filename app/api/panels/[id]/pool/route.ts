import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { REQUIRED_ATTENDEE_TYPE, isPanelAssignmentRole } from '@/lib/panels/assignment-roles';

type Params = { params: Promise<{ id: string }> };

// GET /api/panels/[id]/pool?role=speaker|volunteer|moderator
// Candidates for assignment: this event's registrations holding the
// attendee_type that role requires (moderator draws from volunteers — see
// REQUIRED_ATTENDEE_TYPE), excluding anyone already assigned to this panel
// in that exact role. Org owner/admin only (same bar as inviting a speaker /
// editing a panel).
export async function GET(req: NextRequest, { params }: Params) {
  const { id: panelId } = await params;
  const role = req.nextUrl.searchParams.get('role');
  if (!isPanelAssignmentRole(role)) {
    return NextResponse.json({ error: 'role must be speaker, volunteer, or moderator' }, { status: 400 });
  }

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

  const { data: panel } = await service
    .from('panels')
    .select('id, event_id')
    .eq('id', panelId)
    .single();
  if (!panel) return NextResponse.json({ error: 'Panel not found' }, { status: 404 });

  const { data: event } = await service
    .from('events')
    .select('organization_id')
    .eq('id', panel.event_id)
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

  const { data: candidates, error } = await service
    .from('volunteer_registrations')
    .select('id, name, email, speaker_topic, panel_id')
    .eq('event_id', panel.event_id)
    .eq('attendee_type', REQUIRED_ATTENDEE_TYPE[role]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: assigned } = await service
    .from('panel_assignments')
    .select('registration_id')
    .eq('panel_id', panelId)
    .eq('role', role);

  const assignedIds = new Set((assigned ?? []).map((a) => a.registration_id));
  // Someone already registered directly on THIS panel (panel_id anchor) is
  // already in the panel's own attendee/speaker/staff list by virtue of that
  // registration -- a secondary assignment would just attach their same row
  // to the same panel a second time, showing them twice. Assignment is for
  // attaching someone registered elsewhere (a different panel, a shift,
  // shiftless, or event-level) who should additionally help with this one.
  const available = (candidates ?? [])
    .filter((c) => !assignedIds.has(c.id))
    .filter((c) => c.panel_id !== panelId)
    .map(({ id, name, email, speaker_topic }) => ({ id, name, email, speaker_topic }));

  return NextResponse.json(available);
}
