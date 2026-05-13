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

export async function GET(request: Request) {
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit     = parseInt(searchParams.get('limit') || '50');
  const scheduled = searchParams.get('scheduled') === 'true';
  const orgId     = searchParams.get('org_id');

  if (orgId) {
    const { data: membership } = await service.from('organization_admins')
      .select('role').eq('organization_id', orgId).eq('user_id', user.id).single();
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let query = service
    .from('messages')
    .select('*, events(title), shifts(name, start_time)')
    .limit(limit);

  if (orgId) {
    query = query.eq('organization_id', orgId);
  }

  if (scheduled) {
    query = query.eq('delivery_status', 'scheduled').order('scheduled_for', { ascending: true });
  } else {
    query = query.neq('delivery_status', 'scheduled').order('sent_at', { ascending: false });
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const messagesWithRecipients = (data ?? []).map((message) => ({
    ...message,
    recipients: (message.recipient_emails || []).map((email: string) => ({
      email,
      name: email.split('@')[0],
    })),
  }));

  return NextResponse.json(messagesWithRecipients);
}

export async function DELETE(request: Request) {
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing message id' }, { status: 400 });
  }

  // Verify the message is still scheduled (not already sent)
  const { data: msg } = await service
    .from('messages')
    .select('delivery_status, organization_id')
    .eq('id', id)
    .single();

  if (!msg) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  const { data: membership } = await service.from('organization_admins')
    .select('role').eq('organization_id', msg.organization_id).eq('user_id', user.id).single();
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (msg.delivery_status !== 'scheduled') {
    return NextResponse.json({ error: 'Only scheduled messages can be cancelled' }, { status: 400 });
  }

  // Delete scheduled_emails rows first (also handled by ON DELETE CASCADE if set up,
  // but being explicit is safer)
  await service.from('scheduled_emails').delete().eq('message_id', id).eq('status', 'pending');

  // Delete the message record
  const { error } = await service.from('messages').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}