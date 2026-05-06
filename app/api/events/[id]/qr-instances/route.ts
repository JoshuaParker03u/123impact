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

async function requireAccess(service: any, eventId: string, userId: string) {
  const { data: event } = await service
    .from('events')
    .select('id, event_id, organization_id')
    .eq('id', eventId)
    .single();
  if (!event) return { error: 'Event not found', status: 404 };

  // Org admin/owner OR active event admin
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
  return { event, isAdmin };
}

// GET /api/events/[id]/qr-instances
// Returns all instances with scan counts. Auto-creates the default instance if none exist.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: eventId } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const check = await requireAccess(service, eventId, user.id);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status as number });

  const { event } = check as any;

  // Fetch instances
  let { data: instances } = await service
    .from('qr_code_instances')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  // Auto-create default instance if none exist
  if (!instances || instances.length === 0) {
    const { data: created } = await service
      .from('qr_code_instances')
      .insert({
        event_id:        eventId,
        organization_id: event.organization_id,
        label:           'Default',
      })
      .select()
      .single();
    instances = created ? [created] : [];
  }

  // Attach scan counts
  const instanceIds = (instances ?? []).map((i: any) => i.id);
  const { data: scanRows } = await service
    .from('qr_scan_events')
    .select('instance_id')
    .in('instance_id', instanceIds);

  const scanMap: Record<string, number> = {};
  (scanRows ?? []).forEach((r: any) => {
    scanMap[r.instance_id] = (scanMap[r.instance_id] ?? 0) + 1;
  });

  const enriched = (instances ?? []).map((i: any) => ({
    ...i,
    scan_count: scanMap[i.id] ?? 0,
  }));

  return NextResponse.json({ instances: enriched, event_slug: event.event_id });
}

// POST /api/events/[id]/qr-instances — create a new placement instance
export async function POST(req: NextRequest, { params }: Params) {
  const { id: eventId } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const check = await requireAccess(service, eventId, user.id);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status as number });

  const { event } = check as any;
  const { label, type } = await req.json();
  if (!label?.trim()) return NextResponse.json({ error: 'Label is required' }, { status: 400 });
  const instanceType = type === 'link' ? 'link' : 'qr';

  const { data: instance, error } = await service
    .from('qr_code_instances')
    .insert({
      event_id:        eventId,
      organization_id: event.organization_id,
      label:           label.trim(),
      type:            instanceType,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...instance, scan_count: 0 }, { status: 201 });
}
