import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

type Params = { params: Promise<{ id: string }> };

function buildServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function buildSessionClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
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
}

async function requireOrgAdmin(service: ReturnType<typeof buildServiceClient>, panelId: string, userId: string) {
  const { data: panel } = await service
    .from('panels')
    .select('id, event_id, events!inner(organization_id)')
    .eq('id', panelId)
    .single();
  if (!panel) return { error: 'Panel not found', status: 404 } as const;

  const orgId = (panel as any).events.organization_id;
  const { data: membership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return { error: 'Forbidden', status: 403 } as const;
  }
  return { panel } as const;
}

// PATCH /api/panels/[id] — update a panel. Org owner/admin only.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: panelId } = await params;
  const cookieStore = await cookies();
  const session = await buildSessionClient(cookieStore);
  const service = buildServiceClient();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const check = await requireOrgAdmin(service, panelId, user.id);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const body = await req.json();
  const { name, description, start_time, end_time, panel_date, location, capacity, allow_waitlist } = body;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (start_time !== undefined) updates.start_time = start_time;
  if (end_time !== undefined) updates.end_time = end_time;
  if (panel_date !== undefined) updates.panel_date = panel_date;
  if (location !== undefined) updates.location = location;
  if (capacity !== undefined) updates.capacity = capacity;
  if (allow_waitlist !== undefined) updates.allow_waitlist = allow_waitlist;

  const { data: updated, error } = await service
    .from('panels')
    .update(updates)
    .eq('id', panelId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(updated);
}

// DELETE /api/panels/[id] — delete a panel. Org owner/admin only.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id: panelId } = await params;
  const cookieStore = await cookies();
  const session = await buildSessionClient(cookieStore);
  const service = buildServiceClient();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const check = await requireOrgAdmin(service, panelId, user.id);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const { error } = await service.from('panels').delete().eq('id', panelId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
