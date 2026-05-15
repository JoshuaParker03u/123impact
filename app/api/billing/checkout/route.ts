import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { stripe } from '@/lib/stripe';

async function requireOrgAdmin(service: any, userId: string, orgId: string) {
  const { data } = await service
    .from('organization_admins').select('role')
    .eq('organization_id', orgId).eq('user_id', userId).single();
  return data && ['owner', 'admin'].includes(data.role);
}

export async function POST(req: NextRequest) {
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

  const { interval, orgId } = await req.json();
  if (!orgId || !['month', 'year'].includes(interval)) {
    return NextResponse.json({ error: 'orgId and interval (month|year) required' }, { status: 400 });
  }

  if (!await requireOrgAdmin(service, user.id, orgId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: org } = await service
    .from('organizations').select('name, stripe_customer_id').eq('id', orgId).single();
  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

  // Get or create Stripe customer
  let customerId = org.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: org.name,
      metadata: { org_id: orgId },
    });
    customerId = customer.id;
    await service.from('organizations').update({ stripe_customer_id: customerId }).eq('id', orgId);
  }

  const priceId = interval === 'month'
    ? process.env.STRIPE_MONTHLY_PRICE_ID!
    : process.env.STRIPE_ANNUAL_PRICE_ID!;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://123impact.org';

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/admin/organizations?tab=billing&success=1`,
    cancel_url:  `${appUrl}/admin/organizations?tab=billing`,
    metadata: { org_id: orgId },
    subscription_data: { metadata: { org_id: orgId } },
  });

  return NextResponse.json({ url: checkoutSession.url });
}
