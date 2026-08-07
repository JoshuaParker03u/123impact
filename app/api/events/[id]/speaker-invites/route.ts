import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { sendEmail } from '@/lib/email';
import { wrapEmailHtml } from '@/lib/email-templates';
import { getUsersByIds } from '@/lib/adminUsers';

type Params = { params: Promise<{ id: string }> };

async function buildClients() {
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
  return { session, service };
}

function formatSessionTime(time: string | null): string | null {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(':').map(Number);
  const p = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${p}`;
}

async function requireOrgAdmin(service: any, eventId: string, userId: string) {
  const { data: event } = await service
    .from('events')
    .select('event_id, organization_id, title, date, speaker_enabled, organizations!inner(name, logo_url)')
    .eq('id', eventId)
    .single();
  if (!event) return { error: 'Event not found', status: 404 };

  const { data: membership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', event.organization_id)
    .eq('user_id', userId)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return { error: 'Forbidden', status: 403 };
  }

  return { event };
}

// GET /api/events/[id]/speaker-invites — list all invites for this event
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: eventId } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const check = await requireOrgAdmin(service, eventId, user.id);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status as number });

  // Auto-expire stale invites
  await service
    .from('event_speaker_invites')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('event_id', eventId)
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString());

  const { data: invites, error } = await service
    .from('event_speaker_invites')
    .select('*, registration:volunteer_registrations(speaker_bio, speaker_topic)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const inviterIds = [...new Set((invites ?? []).map((i: { invited_by: string }) => i.invited_by))] as string[];
  const userMap = await getUsersByIds(service, inviterIds);

  const enriched = (invites ?? []).map((i: { invited_by: string; registration: { speaker_bio: string | null; speaker_topic: string | null } | null }) => ({
    ...i,
    inviter_name: userMap[i.invited_by]?.user_metadata?.full_name || userMap[i.invited_by]?.email || null,
    speaker_bio: i.registration?.speaker_bio ?? null,
    speaker_topic: i.registration?.speaker_topic ?? null,
  }));

  return NextResponse.json(enriched);
}

// POST /api/events/[id]/speaker-invites — invite a speaker by email
export async function POST(req: NextRequest, { params }: Params) {
  const { id: eventId } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const check = await requireOrgAdmin(service, eventId, user.id);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status as number });

  const { event } = check;
  if (!event.speaker_enabled) {
    return NextResponse.json({ error: 'Speaker signups are not enabled for this event' }, { status: 400 });
  }

  const body = await req.json();
  const { email, topic, session_time } = body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email' }, { status: 400 });
  }
  if (!topic || !topic.trim()) {
    return NextResponse.json({ error: 'Enter a session topic' }, { status: 400 });
  }
  if (session_time && !/^\d{2}:\d{2}$/.test(session_time)) {
    return NextResponse.json({ error: 'Invalid session time' }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedTopic = topic.trim();
  const normalizedSessionTime = session_time || null;

  // Keyed on topic (not just email) so the same person can be invited for
  // multiple distinct talks at the same event — only a duplicate invite for
  // the exact same talk is blocked.
  const { data: existingInvites } = await service
    .from('event_speaker_invites')
    .select('id, status, topic')
    .eq('event_id', eventId)
    .eq('email', normalizedEmail)
    .in('status', ['pending', 'accepted']);

  const normalizedTopicKey = normalizedTopic.toLowerCase();
  const topicDuplicate = (existingInvites ?? []).find(
    (inv) => (inv.topic ?? '').trim().toLowerCase() === normalizedTopicKey
  );

  if (topicDuplicate) {
    return NextResponse.json(
      {
        error: `This person already has ${topicDuplicate.status === 'accepted' ? 'a confirmed' : 'a pending'} invite for "${normalizedTopic}" at this event.`,
        code: 'DUPLICATE_TOPIC',
      },
      { status: 409 }
    );
  }

  // Expiry = event date + 5 days, or 30 days from now if that's sooner/past
  const eventDate = new Date(event.date);
  const afterEvent = new Date(eventDate.getTime() + 5 * 24 * 60 * 60 * 1000);
  const fallback = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const expiresAt = (afterEvent > new Date() ? afterEvent : fallback).toISOString();

  const { data: invite, error } = await service
    .from('event_speaker_invites')
    .insert({
      event_id:     eventId,
      email:        normalizedEmail,
      topic:        normalizedTopic,
      session_time: normalizedSessionTime,
      invited_by:   user.id,
      expires_at:   expiresAt,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const org = event.organizations;
  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || '';
  const signupUrl = `${origin}/events/${event.event_id}/signup/speaker?token=${invite.token}`;

  const { data: inviterData } = await service.auth.admin.getUserById(user.id);
  const inviterName = inviterData?.user?.user_metadata?.full_name || inviterData?.user?.email || 'Someone';
  const formattedSessionTime = formatSessionTime(normalizedSessionTime);

  const html = wrapEmailHtml(`
    <h2>You're invited to speak</h2>
    <p>${inviterName} has invited you to speak at:</p>
    <p style="font-size:20px;font-weight:bold;margin:16px 0;">${event.title}</p>
    <p style="color:#6b7280;margin-bottom:24px;">Hosted by ${org.name}</p>
    <p style="margin-bottom:24px;"><strong>Topic:</strong> ${normalizedTopic}${formattedSessionTime ? `<br/><strong>Time:</strong> ${formattedSessionTime}` : ''}</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${signupUrl}"
         style="background:#2563eb;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
        Confirm Your Speaking Slot
      </a>
    </div>
    <p style="color:#9ca3af;font-size:13px;">Or copy this link:<br/>${signupUrl}</p>
    <p style="color:#9ca3af;font-size:13px;">This invitation expires on ${new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.</p>
  `, { name: org.name, logoUrl: org.logo_url });

  sendEmail({
    to: normalizedEmail,
    subject: `${inviterName} invited you to speak at "${event.title}"`,
    html,
  }).catch((e) => console.error('Speaker invite email error:', e));

  return NextResponse.json(invite, { status: 201 });
}
