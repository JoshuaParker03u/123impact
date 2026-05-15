import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function anniversaryDate(createdAt: string): Date {
  const created = new Date(createdAt);
  const now = new Date();
  const anniversary = new Date(created);
  anniversary.setFullYear(now.getFullYear());
  if (anniversary > now) anniversary.setFullYear(now.getFullYear() - 1);
  return anniversary;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const now = new Date().toISOString();

  // Downgrade orgs whose grace period has expired
  const { data: lapsed } = await service
    .from('organizations')
    .select('id')
    .neq('plan', 'free')
    .not('grace_period_end', 'is', null)
    .lte('grace_period_end', now);

  let downgraded = 0;
  if (lapsed && lapsed.length > 0) {
    const ids = lapsed.map((o: any) => o.id);
    await service.from('organizations').update({
      plan:                   'free',
      subscription_status:    'inactive',
      stripe_subscription_id: null,
      billing_interval:       null,
      current_period_end:     null,
      grace_period_end:       null,
    }).in('id', ids);
    downgraded = ids.length;
  }

  // Send 28-event warning notifications for free orgs approaching the limit
  const { data: freeOrgs } = await service
    .from('organizations')
    .select('id, created_at')
    .eq('plan', 'free');

  let warned = 0;
  if (freeOrgs) {
    for (const org of freeOrgs) {
      const anniversary = anniversaryDate(org.created_at);
      const { count } = await service
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', org.id)
        .gte('created_at', anniversary.toISOString());

      if (count === 28) {
        const { data: admins } = await service
          .from('organization_admins').select('user_id')
          .eq('organization_id', org.id).in('role', ['owner', 'admin']);

        if (admins && admins.length > 0) {
          // Only insert if they haven't been warned this cycle (idempotency via upsert not needed — daily cron means this fires once per day)
          const existing = await service
            .from('notifications')
            .select('id')
            .eq('user_id', admins[0].user_id)
            .eq('type', 'event_limit_warning')
            .gte('created_at', anniversary.toISOString())
            .maybeSingle();

          if (!existing.data) {
            await service.from('notifications').insert(
              admins.map((a: any) => ({
                user_id: a.user_id,
                type:    'event_limit_warning',
                title:   'Approaching event limit',
                body:    'You have used 28 of 35 free events this year. Upgrade to Pro for unlimited events.',
                link:    '/admin/organizations?tab=billing',
              }))
            );
            warned++;
          }
        }
      }
    }
  }

  return NextResponse.json({ downgraded, warned });
}
