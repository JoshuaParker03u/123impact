import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import { wrapEmailHtml } from '@/lib/email-templates';
import { scheduleAutomatedEmails } from '@/lib/scheduling';

function buildServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function panelsConflict(
  a: { start_time: string; end_time: string; panel_date: string | null },
  b: { start_time: string; end_time: string; panel_date: string | null },
  eventDate: string
): boolean {
  const dateA = a.panel_date ?? eventDate;
  const dateB = b.panel_date ?? eventDate;
  if (dateA !== dateB) return false;
  return a.start_time < b.end_time && a.end_time > b.start_time;
}

async function sendPanelConfirmation(
  supabase: ReturnType<typeof buildServiceClient>,
  volunteerName: string,
  volunteerEmail: string,
  panel: { name: string; start_time: string; end_time: string; panel_date: string | null; location: string | null; online_url: string | null },
  event: { title: string; date: string; location: string; organizations: any }
) {
  const org = event.organizations;
  const branding = { name: org?.name, logoUrl: org?.logo_url };
  const panelDate = panel.panel_date ?? event.date;

  const html = wrapEmailHtml(`
    <h2>Registration Confirmed</h2>
    <p>Hi ${volunteerName},</p>
    <p>You're registered to attend <strong>${panel.name}</strong> at <strong>${event.title}</strong>. We look forward to seeing you!</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr><td style="padding:8px 0;color:#6b7280;width:120px;">Panel</td><td style="padding:8px 0;font-weight:600;">${panel.name}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Date</td><td style="padding:8px 0;">${panelDate}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Time</td><td style="padding:8px 0;">${panel.start_time} – ${panel.end_time}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Location</td><td style="padding:8px 0;">${panel.location || event.location}</td></tr>
      ${panel.online_url ? `<tr><td style="padding:8px 0;color:#6b7280;">Join Link</td><td style="padding:8px 0;"><a href="${panel.online_url}">${panel.online_url}</a></td></tr>` : ''}
    </table>
    <p>See you there!</p>
  `, branding);

  await sendEmail({
    to: volunteerEmail,
    subject: `Confirmed: ${panel.name}`,
    html,
  });
}

// POST /api/panel-registrations — public, single-panel RSVP.
// Body: { panel_id, name, email?, phone?, pronouns?, discord_user_id? }
// email is required UNLESS discord_user_id is present (the Discord bot's
// /signup flow captures a Discord identity instead of an email).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

  const { panel_id, name, email, phone, pronouns, discord_user_id, attendee_type } = body;
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
  if (!panel_id || !name || (!normalizedEmail && !discord_user_id)) {
    return NextResponse.json({ error: 'panel_id, name, and either email or a Discord account are required' }, { status: 400 });
  }
  // Only 'volunteer' is accepted as an override -- anything else (including
  // omitted) safely falls back to the long-standing 'attendee' behavior
  // rather than trusting an arbitrary value from the request body.
  const normalizedAttendeeType = attendee_type === 'volunteer' ? 'volunteer' : 'attendee';

  const supabase = buildServiceClient();

  const { data: panel } = await supabase
    .from('panels')
    .select('id, event_id, name, start_time, end_time, panel_date, location, online_url, capacity, allow_waitlist')
    .eq('id', panel_id)
    .single();

  if (!panel) return NextResponse.json({ error: 'Panel not found' }, { status: 404 });

  const { data: event } = await supabase
    .from('events')
    .select('title, date, location, organizations(name, logo_url)')
    .eq('id', panel.event_id)
    .single();

  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  // Conflict check against this person's other panel RSVPs at the same
  // event -- keyed by email when given, otherwise by Discord identity (bot
  // signups with no email).
  const identityQuery = supabase
    .from('volunteer_registrations')
    .select('id, panel_id, discord_user_id, panels(name, start_time, end_time, panel_date)')
    .eq('event_id', panel.event_id)
    .not('panel_id', 'is', null);
  const { data: otherPanelRegs } = await (normalizedEmail
    ? identityQuery.eq('email', normalizedEmail)
    : identityQuery.eq('discord_user_id', discord_user_id));

  // Check for an existing registration for THIS panel before the capacity
  // check below — otherwise a duplicate submission for an already-full
  // panel gets told "it's full" instead of the more accurate "you're
  // already registered" (the unique-index catch further down would give
  // the right message, but only if the capacity check didn't short-circuit
  // first).
  const existingForThisPanel = (otherPanelRegs ?? []).find((reg) => reg.panel_id === panel_id);
  if (existingForThisPanel) {
    // A Discord signup for an email that already has a registration here
    // (e.g. from before that account ever used the bot) would otherwise
    // just fail outright — instead attach this Discord account to the
    // existing registration so the bot can start DMing them, mirroring the
    // shift/RSVP signup paths.
    if (discord_user_id) {
      if (existingForThisPanel.discord_user_id && existingForThisPanel.discord_user_id !== discord_user_id) {
        return NextResponse.json({ error: 'You are already registered for this panel' }, { status: 409 });
      }
      if (!existingForThisPanel.discord_user_id) {
        await supabase
          .from('volunteer_registrations')
          .update({ discord_user_id })
          .eq('id', existingForThisPanel.id);
      }
      return NextResponse.json({ alreadyRegistered: true, panelName: panel.name }, { status: 200 });
    }
    return NextResponse.json({ error: 'You are already registered for this panel' }, { status: 409 });
  }

  for (const reg of otherPanelRegs ?? []) {
    const other = (reg as any).panels;
    if (!other || reg.panel_id === panel_id) continue;
    if (panelsConflict(panel, other, event.date)) {
      return NextResponse.json({
        error: `"${panel.name}" conflicts with your existing registration for "${other.name}"`,
      }, { status: 409 });
    }
  }

  const { count: confirmed } = await supabase
    .from('volunteer_registrations')
    .select('*', { count: 'exact', head: true })
    .eq('panel_id', panel_id)
    .eq('is_waitlisted', false);

  const isFull = panel.capacity != null && (confirmed ?? 0) >= panel.capacity;
  const isWaitlisted = isFull && panel.allow_waitlist;

  if (isFull && !panel.allow_waitlist) {
    return NextResponse.json({ error: `"${panel.name}" is full and does not have a waitlist` }, { status: 409 });
  }

  const { data: registration, error: regError } = await supabase
    .from('volunteer_registrations')
    .insert({
      event_id:      panel.event_id,
      panel_id,
      name,
      email:         normalizedEmail,
      phone:         phone ?? null,
      pronouns:      pronouns ?? null,
      attendee_type: normalizedAttendeeType,
      is_waitlisted: isWaitlisted,
      discord_user_id: discord_user_id ?? null,
    })
    .select()
    .single();

  if (regError) {
    if (regError.code === '23505') {
      return NextResponse.json({ error: 'You are already registered for this panel' }, { status: 409 });
    }
    return NextResponse.json({ error: regError.message }, { status: 500 });
  }

  // No email to confirm for a Discord-only signup -- the bot sends its own
  // DM confirmation instead (app/api/discord/interactions/route.ts).
  if (normalizedEmail) {
    sendPanelConfirmation(supabase, name, normalizedEmail, panel, event as any)
      .catch((e) => console.error('sendPanelConfirmation error:', e));
  }
  scheduleAutomatedEmails(supabase, registration.id, name, normalizedEmail, panel.event_id, null, panel_id)
    .catch((e) => console.error('scheduleAutomatedEmails error:', e));

  return NextResponse.json({ ...registration, isWaitlisted, panelName: panel.name }, { status: 201 });
}
