import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// POST /api/cron/registration-digest
// Called once daily by Vercel Cron (configure in vercel.json).
// For each event with new registrations in the last 24 hours, creates an
// in-app notification for all org admins + active event admins on that event.
export async function GET(req: NextRequest) {
  // Bearer-token guard — Vercel Cron injects this automatically
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Find events with new registrations in the last 24h
  const { data: recentRegs } = await service
    .from('volunteer_registrations')
    .select('shift_id, shifts!inner(event_id)')
    .gte('registered_at', since);

  if (!recentRegs || recentRegs.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  // Group by event_id
  const countByEvent: Record<string, number> = {};
  for (const reg of recentRegs) {
    const eventId = (reg as any).shifts?.event_id;
    if (eventId) countByEvent[eventId] = (countByEvent[eventId] ?? 0) + 1;
  }

  const eventIds = Object.keys(countByEvent);
  if (eventIds.length === 0) return NextResponse.json({ sent: 0 });

  // Load event + org info
  const { data: events } = await service
    .from('events')
    .select('id, title, organization_id')
    .in('id', eventIds);

  let totalNotifications = 0;

  for (const event of events ?? []) {
    const count = countByEvent[event.id];
    const body  = `${count} new registration${count === 1 ? '' : 's'} for "${event.title}" in the last 24 hours.`;
    const link  = `/admin/events/${event.id}`;

    // Collect recipient user IDs (org admins + active event admins), deduplicated
    const recipientSet = new Set<string>();

    const { data: orgAdmins } = await service
      .from('organization_admins')
      .select('user_id')
      .eq('organization_id', event.organization_id)
      .in('role', ['owner', 'admin']);
    (orgAdmins ?? []).forEach((r: any) => recipientSet.add(r.user_id));

    const { data: eventAdmins } = await service
      .from('event_admin_assignments')
      .select('user_id')
      .eq('event_id', event.id)
      .eq('status', 'active')
      .not('user_id', 'is', null);
    (eventAdmins ?? []).forEach((r: any) => { if (r.user_id) recipientSet.add(r.user_id); });

    if (recipientSet.size === 0) continue;

    const notifications = Array.from(recipientSet).map((userId) => ({
      user_id: userId,
      type:    'daily_registration_digest',
      title:   'New event registrations',
      body,
      link,
    }));

    const { error } = await service.from('notifications').insert(notifications);
    if (!error) totalNotifications += notifications.length;
  }

  return NextResponse.json({ sent: totalNotifications });
}
