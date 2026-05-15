import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

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

  const { data: event } = await service
    .from('events')
    .select(`
      id, event_id, title, description, date, end_date, time,
      location, image_url, status, organization_id,
      shifts (id, shift_id, name, description, start_time, end_time, capacity, shift_date),
      event_day_hours (id, event_date, start_time, end_time)
    `)
    .eq('event_id', slug)
    .single();

  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
    event,
    userRole: orgMembership?.role ?? null,
    isEventAdmin: !!eventAdminRow,
  });
}
