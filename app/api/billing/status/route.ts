import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

function anniversaryDate(createdAt: string): Date {
  const created = new Date(createdAt);
  const now = new Date();
  const anniversary = new Date(created);
  anniversary.setFullYear(now.getFullYear());
  if (anniversary > now) anniversary.setFullYear(now.getFullYear() - 1);
  return anniversary;
}

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

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

  const { data: membership } = await service
    .from('organization_admins').select('role')
    .eq('organization_id', orgId).eq('user_id', user.id).single();
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: org } = await service
    .from('organizations')
    .select('plan, subscription_status, billing_interval, current_period_end, grace_period_end, created_at, stripe_customer_id')
    .eq('id', orgId).single();
  if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const anniversary = anniversaryDate(org.created_at);
  const { count } = await service
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .gte('created_at', anniversary.toISOString());

  const now = new Date();
  const graceEnd = org.grace_period_end ? new Date(org.grace_period_end) : null;

  return NextResponse.json({
    plan:               org.plan,
    subscription_status: org.subscription_status,
    billing_interval:   org.billing_interval,
    current_period_end: org.current_period_end,
    grace_period_end:   org.grace_period_end,
    events_this_year:   count ?? 0,
    event_limit:        35,
    is_in_grace_period: graceEnd ? graceEnd > now : false,
    has_stripe_customer: !!org.stripe_customer_id,
  });
}
