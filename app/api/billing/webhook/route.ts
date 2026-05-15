import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';
import Stripe from 'stripe';

export const runtime = 'nodejs';

function makeService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function syncSubscription(
  service: ReturnType<typeof makeService>,
  orgId: string,
  updates: Record<string, unknown>
) {
  await service.from('organizations').update(updates).eq('id', orgId);
}

async function findOrgByCustomer(service: ReturnType<typeof makeService>, customerId: string) {
  const { data } = await service
    .from('organizations').select('id').eq('stripe_customer_id', customerId).single();
  return data?.id as string | undefined;
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 });
  }

  const service = makeService();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.metadata?.org_id;
      if (!orgId || session.mode !== 'subscription') break;

      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
      await syncSubscription(service, orgId, {
        stripe_customer_id:     session.customer,
        stripe_subscription_id: sub.id,
        subscription_status:    sub.status,
        billing_interval:       sub.items.data[0]?.plan.interval ?? null,
        current_period_end:     new Date((sub as any).current_period_end * 1000).toISOString(),
        grace_period_end:       null,
        plan:                   'pro',
      });
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer as any)?.id;
      if (!customerId) break;
      const orgId = await findOrgByCustomer(service, customerId);
      if (!orgId) break;

      // v22: subscription id lives at invoice.parent.subscription_details.subscription
      const subId = (invoice.parent?.subscription_details?.subscription as any);
      const subIdStr = typeof subId === 'string' ? subId : subId?.id;
      if (subIdStr) {
        const sub = await stripe.subscriptions.retrieve(subIdStr);
        await syncSubscription(service, orgId, {
          subscription_status: 'active',
          current_period_end:  new Date((sub as any).current_period_end * 1000).toISOString(),
          grace_period_end:    null,
        });
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer as any)?.id;
      if (!customerId) break;
      const orgId = await findOrgByCustomer(service, customerId);
      if (!orgId) break;

      const graceEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      await syncSubscription(service, orgId, {
        subscription_status: 'past_due',
        grace_period_end:    graceEnd,
      });
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
      if (!customerId) break;
      const orgId = await findOrgByCustomer(service, customerId);
      if (!orgId) break;

      await syncSubscription(service, orgId, {
        subscription_status: sub.status,
        billing_interval:    sub.items.data[0]?.plan.interval ?? null,
        current_period_end:  new Date((sub as any).current_period_end * 1000).toISOString(),
      });
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
      if (!customerId) break;
      const orgId = await findOrgByCustomer(service, customerId);
      if (!orgId) break;

      // 30-day grace on voluntary cancel
      const graceEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await syncSubscription(service, orgId, {
        subscription_status:    'canceled',
        stripe_subscription_id: null,
        grace_period_end:       graceEnd,
      });
      break;
    }
  }

  return NextResponse.json({ received: true });
}
