import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

type Params = { params: Promise<{ id: string }> };

// GET /api/panels/[id]/pool?role=speaker|volunteer
// Candidates for assignment: this event's registrations with that role,
// excluding anyone already assigned to this panel in that role. Org
// owner/admin only (same bar as inviting a speaker / editing a panel).
export async function GET(req: NextRequest, { params }: Params) {
  const { id: panelId } = await params;
  const role = req.nextUrl.searchParams.get('role');
  if (role !== 'speaker' && role !== 'volunteer') {
    return NextResponse.json({ error: 'role must be speaker or volunteer' }, { status: 400 });
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
    .select('id, name, email, speaker_topic')
    .eq('event_id', panel.event_id)
    .eq('attendee_type', role);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: assigned } = await service
    .from('panel_assignments')
    .select('registration_id')
    .eq('panel_id', panelId)
    .eq('role', role);

  const assignedIds = new Set((assigned ?? []).map((a) => a.registration_id));
  const available = (candidates ?? []).filter((c) => !assignedIds.has(c.id));

  return NextResponse.json(available);
}
