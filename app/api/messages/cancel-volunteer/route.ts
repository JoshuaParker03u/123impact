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

// DELETE /api/messages/cancel-volunteer?email=...&org_id=...
// Removes a volunteer's email from all pending scheduled messages in their org.
export async function DELETE(request: Request) {
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  const orgId = searchParams.get('org_id');

  if (!email) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 });
  }
  if (!orgId) {
    return NextResponse.json({ error: 'Missing org_id' }, { status: 400 });
  }

  // Verify the caller belongs to the org before mutating its scheduled mail.
  const { data: membership } = await service
    .from('organization_admins')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 1. Find this org's scheduled messages that include this email
  const { data: msgs } = await service
    .from('messages')
    .select('id, recipient_emails, recipient_count')
    .eq('organization_id', orgId)
    .eq('delivery_status', 'scheduled')
    .contains('recipient_emails', [email]);

  // 2. Delete pending scheduled_email rows for this volunteer, scoped to this
  //    org's messages only (so we never touch another org's queue)
  const orgMessageIds = (msgs ?? []).map(m => m.id);
  if (orgMessageIds.length > 0) {
    await service
      .from('scheduled_emails')
      .delete()
      .eq('volunteer_email', email)
      .eq('status', 'pending')
      .in('message_id', orgMessageIds);
  }

  if (msgs && msgs.length > 0) {
    for (const msg of msgs) {
      const updated: string[] = (msg.recipient_emails as string[]).filter(
        (e: string) => e !== email
      );

      if (updated.length === 0) {
        // No recipients left — cancel the whole message
        await service.from('messages').delete().eq('id', msg.id);
      } else {
        await service
          .from('messages')
          .update({ recipient_emails: updated, recipient_count: updated.length })
          .eq('id', msg.id);
      }
    }
  }

  return NextResponse.json({ success: true });
}
