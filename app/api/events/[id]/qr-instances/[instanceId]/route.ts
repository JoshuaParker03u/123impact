import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

type Params = { params: Promise<{ id: string; instanceId: string }> };

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
    .select('id, organization_id')
    .eq('id', eventId)
    .single();
  if (!event) return { error: 'Event not found', status: 404 };

  const { data: orgMembership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', event.organization_id)
    .eq('user_id', userId)
    .single();

  const { data: eventAdmin } = await service
    .from('event_admin_assignments')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  const isAdmin = orgMembership && ['owner', 'admin'].includes(orgMembership.role);
  const isEventAdmin = !!eventAdmin;

  if (!isAdmin && !isEventAdmin) return { error: 'Forbidden', status: 403 };
  return { event };
}

// POST /api/events/[id]/qr-instances/[instanceId]
// Body: { action: 'regenerate' }
// Deactivates old instance and creates a new one with the same label.
export async function POST(req: NextRequest, { params }: Params) {
  const { id: eventId, instanceId } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const check = await requireAccess(service, eventId, user.id);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status as number });

  const { event } = check as any;
  const body = await req.json();
  if (body?.action !== 'regenerate') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  // Fetch the existing instance
  const { data: existing } = await service
    .from('qr_code_instances')
    .select('*')
    .eq('id', instanceId)
    .eq('event_id', eventId)
    .single();

  if (!existing) return NextResponse.json({ error: 'Instance not found' }, { status: 404 });

  // Deactivate old instance
  await service
    .from('qr_code_instances')
    .update({ is_active: false })
    .eq('id', instanceId);

  // Create replacement with same label
  const { data: newInstance, error } = await service
    .from('qr_code_instances')
    .insert({
      event_id:        eventId,
      organization_id: event.organization_id,
      label:           existing.label,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ...newInstance, scan_count: 0 }, { status: 201 });
}
