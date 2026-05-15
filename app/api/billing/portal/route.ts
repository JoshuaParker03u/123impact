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

  const { orgId } = await req.json();
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

  if (!await requireOrgAdmin(service, user.id, orgId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: org } = await service
    .from('organizations').select('stripe_customer_id').eq('id', orgId).single();
  if (!org?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account found' }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://123impact.org';

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${appUrl}/admin/organizations?tab=billing`,
  });

  return NextResponse.json({ url: portalSession.url });
}
