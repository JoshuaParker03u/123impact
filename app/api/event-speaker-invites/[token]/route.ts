import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import { wrapEmailHtml } from '@/lib/email-templates';
import { findUserByEmail } from '@/lib/adminUsers';

type Params = { params: Promise<{ token: string }> };

interface InviteEvent {
  id: string;
  event_id: string;
  title: string;
  date: string;
  location: string;
  speaker_enabled: boolean;
  organization_id: string;
  organizations: { name: string; logo_url: string | null };
}

interface InviteRow {
  id: string;
  email: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at: string;
  topic: string | null;
  session_time: string | null;
  events: InviteEvent;
}

function formatSessionTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const p = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${p}`;
}

function buildServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function loadValidInvite(service: ReturnType<typeof buildServiceClient>, token: string) {
  const { data: invite } = await service
    .from('event_speaker_invites')
    .select('*, events!inner(id, event_id, title, date, location, speaker_enabled, organization_id, organizations!inner(name, logo_url))')
    .eq('token', token)
    .single<InviteRow>();

  if (!invite) return { error: 'Invalid invitation link', status: 404 } as const;

  if (new Date(invite.expires_at) < new Date() && invite.status === 'pending') {
    await service
      .from('event_speaker_invites')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', invite.id);
    invite.status = 'expired';
  }

  return { invite } as const;
}

// GET /api/event-speaker-invites/[token] — public lookup, no auth
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const service = buildServiceClient();

  const result = await loadValidInvite(service, token);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const { invite } = result;

  // Pre-fill from whatever we already know about this email — an existing
  // account's profile (name/bio) and/or their most recent registration
  // (phone) — without requiring the visitor to sign in. The invite is
  // already scoped to a specific email, so looking that email up server-side
  // is what "tied to the invite" means; a client-side session check would
  // only work if the visitor happened to be logged in as that exact account.
  //
  // Only computed while the invite is still pending — once it's been
  // accepted/expired/revoked there's no legitimate reason to keep disclosing
  // this data to whoever still holds the link (forwarded email, browser
  // history on a shared computer, etc.). And the registration lookup is
  // scoped to this invite's own organization — the invitee's history with a
  // *different* org (e.g. a phone number given elsewhere) isn't this org's
  // business just because they were invited to speak here.
  let prefill: { name: string | null; phone: string | null; bio: string | null } | null = null;
  if (invite.status === 'pending') {
    const matchedUser = await findUserByEmail(service, invite.email);
    const { data: pastRegistration } = await service
      .from('volunteer_registrations')
      .select('name, phone, events!inner(organization_id)')
      .eq('email', invite.email.toLowerCase())
      .eq('events.organization_id', invite.events.organization_id)
      .order('registered_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    prefill = {
      name:  matchedUser?.user_metadata?.full_name ?? pastRegistration?.name ?? null,
      phone: pastRegistration?.phone ?? null,
      bio:   matchedUser?.user_metadata?.bio ?? null,
    };
  }

  return NextResponse.json({
    status:       invite.status,
    email:        invite.email,
    topic:        invite.topic,
    session_time: invite.session_time,
    event:        invite.events,
    prefill,
  });
}

// POST /api/event-speaker-invites/[token] — public, submits the speaker's
// registration. No account/login involved, same as any other public signup.
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const service = buildServiceClient();

  const result = await loadValidInvite(service, token);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const { invite } = result;
  const event = invite.events;

  if (invite.status === 'accepted') {
    return NextResponse.json({ error: 'This invitation has already been used' }, { status: 409 });
  }
  if (invite.status !== 'pending') {
    return NextResponse.json({ error: 'This invitation is no longer valid' }, { status: 410 });
  }
  if (!event.speaker_enabled) {
    return NextResponse.json({ error: 'Speaker signups are not enabled for this event' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const { name, phone, bio, topic } = body;
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  // The topic is normally set by the inviter up front (invite.topic). Fall
  // back to whatever the invitee submitted only for invites created before
  // that field existed.
  const { data: registration, error: regError } = await service
    .from('volunteer_registrations')
    .insert({
      event_id:      event.id,
      name,
      email:         invite.email,
      phone:         phone ?? null,
      attendee_type: 'speaker',
      speaker_bio:   bio ?? null,
      speaker_topic: invite.topic ?? topic ?? null,
    })
    .select()
    .single();

  if (regError) {
    if (regError.code === '23505') {
      return NextResponse.json({ error: 'This person has already registered as a speaker for this event' }, { status: 409 });
    }
    return NextResponse.json({ error: regError.message }, { status: 500 });
  }

  await service
    .from('event_speaker_invites')
    .update({ status: 'accepted', registration_id: registration.id, updated_at: new Date().toISOString() })
    .eq('id', invite.id);

  const org = event.organizations;
  const html = wrapEmailHtml(`
    <h2>You're confirmed to speak!</h2>
    <p>Thanks for confirming, ${name} — you're all set to speak at:</p>
    <p style="font-size:20px;font-weight:bold;margin:16px 0;">${event.title}</p>
    <p style="color:#6b7280;">${event.date}${invite.session_time ? ` &middot; ${formatSessionTime(invite.session_time)}` : ''} &middot; ${event.location}</p>
  `, { name: org.name, logoUrl: org.logo_url });

  sendEmail({
    to: invite.email,
    subject: `You're confirmed to speak at "${event.title}"`,
    html,
  }).catch((e) => console.error('Speaker confirmation email error:', e));

  return NextResponse.json(registration, { status: 201 });
}
