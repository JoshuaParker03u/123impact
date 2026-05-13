import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

async function createSessionClient() {
  const cookieStore = await cookies();
  return createServerClient(
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
}

function createServiceRoleClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function createClient() {
  return createSessionClient();
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('eventId');

  if (!eventId) {
    return NextResponse.json({ error: 'Event ID required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('automated_email_templates')
    .select('*')
    .eq('event_id', eventId)
    .order('trigger_type');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

async function verifyTemplateAccess(userId: string, eventId: string, service: ReturnType<typeof createServiceRoleClient>) {
  const { data: event } = await service.from('events').select('organization_id').eq('id', eventId).single();
  if (!event) return 'event_not_found';
  const { data: membership } = await service.from('organization_admins')
    .select('role').eq('organization_id', event.organization_id).eq('user_id', userId).single();
  return membership ? null : 'forbidden';
}

export async function POST(request: Request) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceRoleClient();
  const body = await request.json();
  const accessError = await verifyTemplateAccess(user.id, body.event_id, service);
  if (accessError === 'event_not_found') return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  if (accessError === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await service
    .from('automated_email_templates')
    .insert(body)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceRoleClient();
  const body = await request.json();
  const { id, ...updates } = body;

  const { data: template } = await service.from('automated_email_templates').select('event_id').eq('id', id).single();
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  const accessError = await verifyTemplateAccess(user.id, template.event_id, service);
  if (accessError === 'event_not_found') return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  if (accessError === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await service
    .from('automated_email_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceRoleClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { data: template } = await service.from('automated_email_templates').select('event_id').eq('id', id).single();
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  const accessError = await verifyTemplateAccess(user.id, template.event_id, service);
  if (accessError === 'event_not_found') return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  if (accessError === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await service
    .from('automated_email_templates')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}