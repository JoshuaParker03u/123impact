import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

async function buildClients() {
  const cookieStore = await cookies();
  const session = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
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

// DELETE /api/events/[id]
// Cleans up all related data before deleting the event.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: eventId } = await params;

  // Verify the user is an admin of the org that owns this event
  const { data: event } = await service
    .from('events')
    .select('id, organization_id')
    .eq('id', eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const { data: adminRow } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', event.organization_id)
    .eq('user_id', user.id)
    .single();

  if (!adminRow) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 1. Get all shift IDs for this event
  const { data: shifts } = await service
    .from('shifts')
    .select('id')
    .eq('event_id', eventId);

  const shiftIds = (shifts ?? []).map((s: any) => s.id);

  // 2. Delete volunteer registrations for all shifts
  if (shiftIds.length > 0) {
    await service
      .from('volunteer_registrations')
      .delete()
      .in('shift_id', shiftIds);
  }

  // 3. Cancel pending scheduled_emails for this event
  await service
    .from('scheduled_emails')
    .delete()
    .eq('event_id', eventId)
    .eq('status', 'pending');

  // 4. Delete scheduled messages (messages with delivery_status='scheduled') for this event
  await service
    .from('messages')
    .delete()
    .eq('event_id', eventId)
    .eq('delivery_status', 'scheduled');

  // 5. Delete the event (DB cascades to shifts)
  const { error } = await service
    .from('events')
    .delete()
    .eq('id', eventId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
