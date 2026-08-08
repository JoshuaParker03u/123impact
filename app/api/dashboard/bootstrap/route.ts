import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// GET /api/dashboard/bootstrap
// Combines what used to be four separate authenticated endpoints
// (event-admin-assignments, invitations, speaker-appointments,
// speaker-invites) into one request. Each of those routes only ever had
// one caller — the dashboard's initial load — and each paid its own
// Supabase auth round-trip; this collapses that to a single auth check.

// Matches the untyped `service` client the four routes being replaced here
// each used inline — kept loose rather than fighting Supabase's generic
// typing for a schema this codebase doesn't generate types against.
type ServiceClient = any;

async function loadAssignments(service: ServiceClient, userId: string) {
  const { data, error } = await service
    .from('event_admin_assignments')
    .select('id, expires_at, events!inner(id, event_id, title, date, location, organizations!inner(name, logo_url))')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id:         row.id,
    expires_at: row.expires_at,
    event: {
      id:       row.events.id,
      event_id: row.events.event_id,
      title:    row.events.title,
      date:     row.events.date,
      location: row.events.location,
    },
    org: {
      name:     row.events.organizations.name,
      logo_url: row.events.organizations.logo_url,
    },
  }));
}

// Also backfills an in-app notification for any pending invitation that
// doesn't have one yet — covers invites sent before the recipient had an
// account. Preserved as-is from the standalone route it replaces.
async function loadInvitations(service: ServiceClient, user: { id: string; email: string }) {
  const email = user.email.toLowerCase();
  const now = new Date().toISOString();

  await service
    .from('organization_invitations')
    .update({ status: 'expired', updated_at: now })
    .eq('email', email)
    .eq('status', 'pending')
    .lt('expires_at', now);

  const { data: invites, error } = await service
    .from('organization_invitations')
    .select('id, token, role, invited_by, expires_at, organizations(name, logo_url)')
    .eq('email', email)
    .eq('status', 'pending')
    .gt('expires_at', now)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  if (!invites || invites.length === 0) return [];

  const inviterIds = [...new Set(invites.map((inv: any) => inv.invited_by))] as string[];
  const nameMap: Record<string, string> = {};
  await Promise.all(inviterIds.map(async (id: string) => {
    const { data } = await service.auth.admin.getUserById(id);
    nameMap[id] = data?.user?.user_metadata?.full_name || data?.user?.email || 'A team member';
  }));

  const links = invites.map((inv: any) => `/invite/${inv.token}`);
  const { data: existingNotifs } = await service
    .from('notifications')
    .select('link')
    .eq('user_id', user.id)
    .eq('type', 'org_invitation')
    .in('link', links);
  const existingLinks = new Set((existingNotifs ?? []).map((n: any) => n.link));

  const toInsert = invites
    .filter((inv: any) => !existingLinks.has(`/invite/${inv.token}`))
    .map((inv: any) => ({
      user_id: user.id,
      type:    'org_invitation',
      title:   `You've been invited to join ${inv.organizations?.name ?? 'an organization'}`,
      body:    `${nameMap[inv.invited_by]} invited you to join ${inv.organizations?.name ?? 'an organization'} as ${inv.role}. Click to view the invitation.`,
      link:    `/invite/${inv.token}`,
    }));

  if (toInsert.length > 0) {
    await service.from('notifications').insert(toInsert);
  }

  return invites.map((inv: any) => ({
    id:           inv.id,
    token:        inv.token,
    role:         inv.role,
    expires_at:   inv.expires_at,
    inviter_name: nameMap[inv.invited_by],
    organization: inv.organizations,
  }));
}

async function loadSpeakerAppointments(service: ServiceClient, email: string) {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await service
    .from('event_speaker_invites')
    .select('id, topic, session_time, events!inner(id, event_id, title, date, location, organizations!inner(name, logo_url))')
    .eq('status', 'accepted')
    .eq('email', email)
    .gte('events.date', today)
    .order('date', { foreignTable: 'events', ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id:           row.id,
    topic:        row.topic,
    session_time: row.session_time,
    event: {
      id:       row.events.id,
      event_id: row.events.event_id,
      title:    row.events.title,
      date:     row.events.date,
      location: row.events.location,
    },
    org: {
      name:     row.events.organizations.name,
      logo_url: row.events.organizations.logo_url,
    },
  }));
}

async function loadSpeakerInvites(service: ServiceClient, email: string) {
  const { data, error } = await service
    .from('event_speaker_invites')
    .select('id, token, topic, session_time, expires_at, events!inner(id, event_id, title, date, location, organizations!inner(name, logo_url))')
    .eq('email', email)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('date', { foreignTable: 'events', ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id:           row.id,
    token:        row.token,
    topic:        row.topic,
    session_time: row.session_time,
    expires_at:   row.expires_at,
    event: {
      id:       row.events.id,
      event_id: row.events.event_id,
      title:    row.events.title,
      date:     row.events.date,
      location: row.events.location,
    },
    org: {
      name:     row.events.organizations.name,
      logo_url: row.events.organizations.logo_url,
    },
  }));
}

export async function GET() {
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
  if (!user || !user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const email = user.email.toLowerCase();

  try {
    const [assignments, invitations, speakerAppointments, speakerInvites] = await Promise.all([
      loadAssignments(service, user.id),
      loadInvitations(service, { id: user.id, email }),
      loadSpeakerAppointments(service, email),
      loadSpeakerInvites(service, email),
    ]);

    return NextResponse.json({ assignments, invitations, speakerAppointments, speakerInvites });
  } catch (e: any) {
    console.error('[GET /api/dashboard/bootstrap]', e);
    return NextResponse.json({ error: e.message ?? 'Internal server error' }, { status: 500 });
  }
}
