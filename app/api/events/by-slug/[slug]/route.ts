import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getUsersByIds } from '@/lib/adminUsers';

const PLATFORM_LABELS: Record<string, string> = { eventbrite: 'Eventbrite', luma: 'Luma' };

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const cookieStore = await cookies();
  const session = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(list) {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
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

  // `slug` is normally the public event_id, but links/URLs occasionally carry
  // the raw database id (UUID) instead — e.g. pasted from elsewhere or an
  // older link. Match on whichever column actually fits the value's shape
  // rather than 404ing, and avoid comparing a non-UUID string against the
  // UUID `id` column (which errors at the Postgres level).
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

  const { data: event } = await service
    .from('events')
    .select(`
      id, event_id, title, description, date, end_date, time,
      location, image_url, status, organization_id, series_id,
      is_shiftless, shiftless_capacity, event_format, online_url,
      attendee_enabled, attendee_capacity, speaker_enabled, panels_enabled,
      platform_source, external_id, last_synced_at, sync_status, is_private_on_platform,
      primary_owner_id,
      shifts (id, shift_id, name, description, start_time, end_time, capacity, shift_date, allow_waitlist),
      event_day_hours (id, event_date, start_time, end_time)
    `)
    .eq(isUuid ? 'id' : 'event_id', slug)
    .single();

  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Synced events have no human creator -- attribute to the source platform
  // instead. Falls back to the owning admin's name/email, or null for older
  // events created before primary_owner_id was consistently recorded.
  let createdBy: string | null = null;
  if (event.platform_source) {
    createdBy = PLATFORM_LABELS[event.platform_source] ?? event.platform_source;
  } else if (event.primary_owner_id) {
    const usersById = await getUsersByIds(service, [event.primary_owner_id]);
    const owner = usersById[event.primary_owner_id];
    createdBy = owner?.user_metadata?.full_name ?? owner?.email ?? null;
  }

  // Check access: org admin/member OR active event admin assignment
  const [{ data: orgMembership }, { data: eventAdminRow }] = await Promise.all([
    service
      .from('organization_admins')
      .select('role')
      .eq('organization_id', event.organization_id)
      .eq('user_id', user.id)
      .maybeSingle(),
    service
      .from('event_admin_assignments')
      .select('id')
      .eq('event_id', event.id)
      .eq('user_id', user.id)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(),
  ]);

  if (!orgMembership && !eventAdminRow) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    event: { ...event, created_by_display: createdBy },
    userRole: orgMembership?.role ?? null,
    isEventAdmin: !!eventAdminRow,
  });
}
