/**
 * app/api/[[...path]]/route.ts
 *
 * Single catch-all API route for all event, shift, and volunteer operations.
 * Uses a server-side Supabase client so auth is handled via cookies.
 *
 * ─── Setup ─────────────────────────────────────────────────────────────────
 *
 *   npm install @supabase/ssr
 *
 *   .env.local:
 *     NEXT_PUBLIC_SUPABASE_URL=...
 *     NEXT_PUBLIC_SUPABASE_ANON_KEY=...
 *
 * ─── Auth model ────────────────────────────────────────────────────────────
 *
 *   PUBLIC  (no auth required):
 *     GET  /api/events
 *     GET  /api/events/:id/shifts
 *     POST /api/volunteer-registrations   ← public sign-up form
 *
 *   PROTECTED (valid Supabase session + X-Organization-Id header required):
 *     GET    /api/shifts/:id/volunteers
 *     GET    /api/volunteers
 *     POST   /api/events
 *     POST   /api/shifts
 *     PATCH  /api/events/:id
 *     PATCH  /api/shifts/:id
 *     DELETE /api/events/:id               soft delete by default
 *     DELETE /api/events/:id?hard=true     permanent delete
 *     DELETE /api/shifts/:id
 *
 * ─── Organization scoping (protected routes) ───────────────────────────────
 *
 *   Pass the org UUID in the request header:
 *     X-Organization-Id: <organization uuid>
 *
 *   const { currentOrganization } = useOrganization();
 *   fetch('/api/events', {
 *     method: 'POST',
 *     headers: { 'X-Organization-Id': currentOrganization.organization_id }
 *   });
 */

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { parseEmailTemplate, wrapEmailHtml } from '@/lib/email-templates';
import { sendEmail } from '@/lib/email';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RouteContext {
  params: Promise<{ path?: string[] }>;
}

type SupabaseClient = Awaited<ReturnType<typeof buildSupabaseClient>>;

type AuthSuccess = { supabase: SupabaseClient; user: { id: string }; orgId: string };
type AuthFailure = { error: NextResponse };
type AuthResult  = AuthSuccess | AuthFailure;

// ---------------------------------------------------------------------------
// Supabase server client (anon key — respects RLS, used for authenticated routes)
// ---------------------------------------------------------------------------

async function buildSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch { /* called from a Server Component — safe to ignore */ }
        },
      },
    }
  );
}

// ---------------------------------------------------------------------------
// Supabase service role client — bypasses RLS entirely.
// ONLY use server-side (API routes). Never expose the service role key to
// the browser. Used for public endpoints that need to read/write data without
// an authenticated session.
// ---------------------------------------------------------------------------

function buildServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

const ok   = (data: unknown, status = 200) => NextResponse.json({ data }, { status });
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

// ---------------------------------------------------------------------------
// Auth + org guard — used by protected endpoints only
// ---------------------------------------------------------------------------

async function authenticate(request: NextRequest): Promise<AuthResult> {
  const supabase = await buildSupabaseClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: fail('Unauthorized', 401) };

  const orgId = request.headers.get('X-Organization-Id');
  if (!orgId) return { error: fail('Missing X-Organization-Id header', 400) };

  return { supabase, user, orgId };
}

// ---------------------------------------------------------------------------
// sendRegistrationConfirmation
// Sends an immediate confirmation email to the volunteer after they sign up.
// ---------------------------------------------------------------------------

async function sendRegistrationConfirmation(
  supabase: SupabaseClient,
  volunteerName: string,
  volunteerEmail: string,
  shiftId: string,
  isWaitlisted = false
) {
  const { data: shift } = await supabase
    .from('shifts')
    .select('*, events(*)')
    .eq('id', shiftId)
    .single();

  if (!shift) return;

  const event = shift.events as any;

  const dateDisplay = event.end_date && event.end_date !== event.date
    ? `${event.date} – ${event.end_date}`
    : event.date;

  const detailTable = `
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr><td style="padding:8px 0;color:#6b7280;width:120px;">Event</td><td style="padding:8px 0;font-weight:600;">${event.title}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Date</td><td style="padding:8px 0;">${dateDisplay}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Location</td><td style="padding:8px 0;">${event.location}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Shift</td><td style="padding:8px 0;">${shift.name}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Time</td><td style="padding:8px 0;">${shift.start_time} – ${shift.end_time}</td></tr>
    </table>`;

  const html = isWaitlisted
    ? wrapEmailHtml(`
        <h2>You're on the Waitlist</h2>
        <p>Hi ${volunteerName},</p>
        <p>You've been added to the waitlist for the <strong>${shift.name}</strong> shift at <strong>${event.title}</strong>. The coordinator will reach out if a spot becomes available.</p>
        ${detailTable}
        <p>We'll be in touch!</p>
      `)
    : wrapEmailHtml(`
        <h2>Registration Confirmed</h2>
        <p>Hi ${volunteerName},</p>
        <p>Thank you for signing up to volunteer at <strong>${event.title}</strong>. We look forward to seeing you!</p>
        ${detailTable}
        <p>See you there!</p>
      `);

  await sendEmail({
    to: volunteerEmail,
    subject: isWaitlisted
      ? `Waitlist: ${event.title} – ${shift.name}`
      : `Confirmed: ${event.title} – ${shift.name}`,
    html,
  });
}

// ---------------------------------------------------------------------------
// sendShiftlessConfirmation
// Confirmation email for shiftless event registrations (no shift details).
// ---------------------------------------------------------------------------

async function sendShiftlessConfirmation(
  supabase: SupabaseClient,
  volunteerName: string,
  volunteerEmail: string,
  eventId: string
) {
  const { data: event } = await supabase
    .from('events')
    .select('title, date, end_date, location')
    .eq('id', eventId)
    .single();

  if (!event) return;

  const dateDisplay = event.end_date && event.end_date !== event.date
    ? `${event.date} – ${event.end_date}`
    : event.date;

  const html = wrapEmailHtml(`
    <h2>Registration Confirmed</h2>
    <p>Hi ${volunteerName},</p>
    <p>You're registered for <strong>${event.title}</strong>. We look forward to seeing you!</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr><td style="padding:8px 0;color:#6b7280;width:120px;">Event</td><td style="padding:8px 0;font-weight:600;">${event.title}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Date</td><td style="padding:8px 0;">${dateDisplay}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Location</td><td style="padding:8px 0;">${event.location}</td></tr>
    </table>
    <p>See you there!</p>
  `);

  await sendEmail({
    to: volunteerEmail,
    subject: `Confirmed: ${event.title}`,
    html,
  });
}

// ---------------------------------------------------------------------------
// scheduleAutomatedEmails
// Called after a successful public volunteer registration to queue any
// automated emails defined for the shift's event.
// ---------------------------------------------------------------------------

async function scheduleAutomatedEmails(
  supabase: SupabaseClient,
  registrationId: string,
  volunteerName: string,
  volunteerEmail: string,
  shiftId: string
) {
  // Get shift and event details
  const { data: shift } = await supabase
    .from('shifts')
    .select('*, events(*)')
    .eq('id', shiftId)
    .single();

  if (!shift) return;

  // Get enabled templates for this event
  const { data: templates } = await supabase
    .from('automated_email_templates')
    .select('*')
    .eq('event_id', shift.event_id)
    .eq('enabled', true);

  if (!templates || templates.length === 0) return;

  const shiftStart = new Date(shift.start_time);
  const shiftEnd   = new Date(shift.end_time);

  const scheduledEmails = templates
    .map((template: any) => {
      let scheduledFor: Date;

      switch (template.trigger_type) {
        case 'signup':
          scheduledFor = new Date();
          break;
        case '7_days_before':
          scheduledFor = new Date(shiftStart.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '24_hours_before':
          scheduledFor = new Date(shiftStart.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '1_hour_before':
          scheduledFor = new Date(shiftStart.getTime() - 60 * 60 * 1000);
          break;
        default:
          return null;
      }

      // Don't schedule if the time has already passed (except signup, which is immediate)
      if (scheduledFor < new Date() && template.trigger_type !== 'signup') {
        return null;
      }

      const variables = {
        volunteer_name:    volunteerName,
        volunteer_email:   volunteerEmail,
        event_name:        shift.events.title,
        event_description: shift.events.description || '',
        shift_date:        shiftStart.toLocaleDateString(),
        shift_start_time:  shiftStart.toLocaleTimeString(),
        shift_end_time:    shiftEnd.toLocaleTimeString(),
        shift_location:    shift.location,
        hours_until_shift: Math.floor((shiftStart.getTime() - Date.now()) / (1000 * 60 * 60)),
      };

      const subject = parseEmailTemplate(template.subject, variables);
      const body    = parseEmailTemplate(template.body, variables);

      return {
        template_id:                template.id,
        volunteer_registration_id:  registrationId,
        volunteer_name:             volunteerName,
        volunteer_email:            volunteerEmail,
        event_id:                   shift.event_id,
        shift_id:                   shiftId,
        subject,
        body,
        scheduled_for:              scheduledFor.toISOString(),
        status:                     'pending',
      };
    })
    .filter(Boolean);

  if (scheduledEmails.length > 0) {
    await supabase.from('scheduled_emails').insert(scheduledEmails);
  }
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { path } = await params;
  const seg = path ?? [];

  try {
    // ── PUBLIC: GET /api/events ─────────────────────────────────────────────
    // Requires X-Organization-Id but no auth — public event listings
    if (seg.length === 1 && seg[0] === 'events') {
      const orgId = request.headers.get('X-Organization-Id');
      if (!orgId) return fail('Missing X-Organization-Id header');

      const supabase = await buildSupabaseClient();
      const { data, error } = await supabase
        .from('events')
        .select(`
          id, event_id, title, description, date, time, location,
          image_url, status, primary_owner_id, co_sponsors,
          organization_id, created_at, updated_at
        `)
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .order('date', { ascending: true });

      if (error) throw error;
      return ok(data);
    }

    // ── PUBLIC: GET /api/events/slug/:eventId ───────────────────────────────
    // Looks up a single event by its text event_id slug (used by the public
    // signup page, which knows the slug from the URL but not the org UUID).
    if (seg.length === 3 && seg[0] === 'events' && seg[1] === 'slug') {
      const supabase = buildServiceClient();
      const { data, error } = await supabase
        .from('events')
        .select(`
          id, event_id, title, description, date, end_date, time, location,
          image_url, status, organization_id, is_shiftless, shiftless_capacity,
          created_at, updated_at,
          event_day_hours (event_date, start_time, end_time),
          organizations (id, name, logo_url)
        `)
        .eq('event_id', seg[2])
        .neq('status', 'deleted')
        .single();

      if (error) return fail('Event not found', 404);

      // For shiftless events, include a live count of registrations
      let shiftless_filled = 0;
      if (data.is_shiftless) {
        const { count } = await buildServiceClient()
          .from('volunteer_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', data.id)
          .is('shift_id', null);
        shiftless_filled = count ?? 0;
      }

      return ok({ ...data, shiftless_filled });
    }

    // ── PUBLIC: GET /api/events/:id/shifts ──────────────────────────────────
    if (seg.length === 3 && seg[0] === 'events' && seg[2] === 'shifts') {
      const supabase = buildServiceClient();
      const { data, error } = await supabase
        .from('shifts')
        .select(`
          id, shift_id, name, description,
          start_time, end_time, capacity, allow_waitlist,
          event_id, created_at, updated_at
        `)
        .eq('event_id', seg[1])
        .order('start_time', { ascending: true });

      if (error) throw error;

      const shiftIds = (data ?? []).map((s) => s.id);
      const { data: regRows } = await supabase
        .from('volunteer_registrations')
        .select('shift_id, is_waitlisted')
        .in('shift_id', shiftIds);

      const countMap = (regRows ?? []).reduce<Record<string, { filled: number; waitlisted: number }>>((acc, r) => {
        if (!acc[r.shift_id]) acc[r.shift_id] = { filled: 0, waitlisted: 0 };
        if (r.is_waitlisted) acc[r.shift_id].waitlisted++;
        else acc[r.shift_id].filled++;
        return acc;
      }, {});

      const enriched = (data ?? []).map((shift) => {
        const { filled = 0, waitlisted = 0 } = countMap[shift.id] ?? {};
        return {
          ...shift,
          filled,
          waitlisted,
          available: shift.capacity - filled,
          is_full:   filled >= shift.capacity,
        };
      });

      return ok(enriched);
    }

    // ── PROTECTED: GET /api/shifts/:id/volunteers ───────────────────────────
    // Merges shift_registrations (auth'd users) + volunteer_registrations (guests)
    if (seg.length === 3 && seg[0] === 'shifts' && seg[2] === 'volunteers') {
      const auth = await authenticate(request);
      if ('error' in auth) return auth.error;
      const { supabase } = auth;

      const shiftId = seg[1];

      const [authReg, guestReg] = await Promise.all([
        supabase
          .from('shift_registrations')
          .select(`id, user_id, status, notes, registered_at, usernames (username)`)
          .eq('shift_id', shiftId)
          .eq('status', 'confirmed'),

        supabase
          .from('volunteer_registrations')
          .select(`id, name, email, phone, registered_at`)
          .eq('shift_id', shiftId),
      ]);

      if (authReg.error)  throw authReg.error;
      if (guestReg.error) throw guestReg.error;

      const registered = (authReg.data ?? []).map((r) => ({
        id:            r.id,
        source:        'registered' as const,
        user_id:       r.user_id,
        name:          (r.usernames as { username: string }[] | null)?.[0]?.username
                         ?? `User ${r.user_id.slice(0, 8)}`,
        email:         null,
        phone:         null,
        status:        r.status,
        notes:         r.notes,
        registered_at: r.registered_at,
      }));

      const guests = (guestReg.data ?? []).map((g) => ({
        id:            g.id,
        source:        'guest' as const,
        user_id:       null,
        name:          g.name,
        email:         g.email,
        phone:         g.phone,
        status:        'confirmed',
        notes:         null,
        registered_at: g.registered_at,
      }));

      const sorted = [...registered, ...guests].sort(
        (a, b) => new Date(a.registered_at).getTime() - new Date(b.registered_at).getTime()
      );

      return ok(sorted);
    }

    // ── PROTECTED: GET /api/volunteers ──────────────────────────────────────
    if (seg.length === 1 && seg[0] === 'volunteers') {
      const auth = await authenticate(request);
      if ('error' in auth) return auth.error;
      const { supabase, orgId } = auth;

      const { data, error } = await supabase
        .from('organization_volunteers')
        .select(`
          id, user_id, status, first_volunteer_date,
          total_hours_volunteered, notes, created_at, updated_at,
          usernames (username),
          shift_registrations (
            id, shift_id, status, registered_at, notes,
            shifts (id, shift_id, name, start_time, end_time, event_id)
          )
        `)
        .eq('organization_id', orgId)
        .eq('status', 'active');

      if (error) throw error;

      const volunteers = (data ?? []).map((v) => ({
        id:                      v.id,
        user_id:                 v.user_id,
        username:                (v.usernames as { username: string }[] | null)?.[0]?.username ?? null,
        status:                  v.status,
        first_volunteer_date:    v.first_volunteer_date,
        total_hours_volunteered: v.total_hours_volunteered,
        notes:                   v.notes,
        created_at:              v.created_at,
        shifts: ((v.shift_registrations as any[]) ?? [])
          .filter((sr) => sr.status === 'confirmed')
          .map((sr) => ({
            registration_id: sr.id,
            shift_id:        sr.shift_id,
            shift_name:      sr.shifts?.name       ?? null,
            start_time:      sr.shifts?.start_time  ?? null,
            end_time:        sr.shifts?.end_time     ?? null,
            event_id:        sr.shifts?.event_id     ?? null,
            registered_at:   sr.registered_at,
            notes:           sr.notes,
          })),
      }));

      return ok(volunteers);
    }

    return fail('Not found', 404);
  } catch (e: any) {
    console.error('[GET]', e);
    return fail(e.message ?? 'Internal server error', e.status ?? 500);
  }
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { path } = await params;
  const seg = path ?? [];

  try {
    // ── PUBLIC: POST /api/volunteer-registrations ───────────────────────────
    // No auth required — this is the public sign-up form endpoint.
    // Inserts into volunteer_registrations and queues automated emails.
    if (seg.length === 1 && seg[0] === 'volunteer-registrations') {
      const body = await request.json();
      const { shift_id, event_id, name, email, phone, attendee_type } = body;

      if (!name || !email) return fail('name and email are required');
      if (!shift_id && !event_id) return fail('shift_id or event_id is required');

      const validTypes = ['volunteer', 'attendee', 'speaker'];
      const resolvedType = validTypes.includes(attendee_type) ? attendee_type : 'volunteer';

      const supabase = buildServiceClient();

      // ── Shiftless path ──────────────────────────────────────────────────────
      if (!shift_id) {
        const { data: ev } = await supabase
          .from('events')
          .select('id, is_shiftless, shiftless_capacity')
          .eq('id', event_id)
          .single();

        if (!ev || !ev.is_shiftless) return fail('Event does not allow shiftless registration', 400);

        if (ev.shiftless_capacity) {
          const { count } = await supabase
            .from('volunteer_registrations')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', event_id)
            .is('shift_id', null);
          if ((count ?? 0) >= ev.shiftless_capacity) return fail('This event is full', 409);
        }

        const { data: registration, error: regError } = await supabase
          .from('volunteer_registrations')
          .insert({ event_id, name, email, phone: phone ?? null, attendee_type: resolvedType })
          .select()
          .single();

        if (regError) throw regError;

        sendShiftlessConfirmation(supabase, name, email, event_id)
          .catch((e) => console.error('sendShiftlessConfirmation error:', e));

        return ok(registration, 201);
      }

      // ── Shift-based path ────────────────────────────────────────────────────
      const { data: shift } = await supabase
        .from('shifts')
        .select('id, capacity, allow_waitlist, event_id')
        .eq('id', shift_id)
        .single();

      if (!shift) return fail('Shift not found', 404);

      const { count: confirmedCount } = await supabase
        .from('volunteer_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('shift_id', shift_id)
        .eq('is_waitlisted', false);

      const confirmed = confirmedCount ?? 0;
      const isWaitlisted = confirmed >= shift.capacity;

      if (isWaitlisted && !shift.allow_waitlist) {
        return fail('This shift is full', 409);
      }

      const { data: registration, error: regError } = await supabase
        .from('volunteer_registrations')
        .insert({ shift_id, event_id: shift.event_id, name, email, phone: phone ?? null, attendee_type: resolvedType, is_waitlisted: isWaitlisted })
        .select()
        .single();

      if (regError) throw regError;

      sendRegistrationConfirmation(supabase, name, email, shift_id, isWaitlisted)
        .catch((e) => console.error('sendRegistrationConfirmation error:', e));
      scheduleAutomatedEmails(supabase, registration.id, name, email, shift_id)
        .catch((e) => console.error('scheduleAutomatedEmails error:', e));

      return ok(registration, 201);
    }

    // ── PROTECTED: all other POSTs require auth ─────────────────────────────
    const auth = await authenticate(request);
    if ('error' in auth) return auth.error;
    const { supabase, user, orgId } = auth;

    const body = await request.json();

    // POST /api/events
    if (seg.length === 1 && seg[0] === 'events') {
      const { title, date, time, location } = body;
      if (!title || !date || !time || !location) {
        return fail('title, date, time, and location are required');
      }

      const service = buildServiceClient();
      const { data: org } = await service.from('organizations').select('plan, created_at').eq('id', orgId).single();

      if (body.end_date && (!org || org.plan === 'free')) {
        return fail('Multi-day events require a paid plan', 403);
      }

      if (org?.plan === 'free') {
        const created = new Date(org.created_at);
        const now = new Date();
        const anniversary = new Date(created);
        anniversary.setFullYear(now.getFullYear());
        if (anniversary > now) anniversary.setFullYear(now.getFullYear() - 1);

        const { count } = await service
          .from('events')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .gte('created_at', anniversary.toISOString());

        if ((count ?? 0) >= 35) {
          return fail('You\'ve reached the 35-event free tier limit. Upgrade to Pro for unlimited events.', 403);
        }
      }

      const { data, error } = await supabase
        .from('events')
        .insert({
          ...body,
          organization_id:  orgId,
          primary_owner_id: body.primary_owner_id ?? user.id,
          status:           body.status ?? 'active',
          co_sponsors:      body.co_sponsors ?? [],
        })
        .select()
        .single();

      if (error) throw error;
      return ok(data, 201);
    }

    // POST /api/shifts
    if (seg.length === 1 && seg[0] === 'shifts') {
      const { event_id, name, start_time, end_time, capacity } = body;
      if (!event_id || !name || !start_time || !end_time || !capacity) {
        return fail('event_id, name, start_time, end_time, and capacity are required');
      }

      const { data, error } = await supabase
        .from('shifts')
        .insert({ ...body, filled: body.filled ?? 0 })
        .select()
        .single();

      if (error) throw error;
      return ok(data, 201);
    }

    return fail('Not found', 404);
  } catch (e: any) {
    console.error('[POST]', e);
    return fail(e.message ?? 'Internal server error', e.status ?? 500);
  }
}

// ---------------------------------------------------------------------------
// PATCH — all protected
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { path } = await params;
  const seg = path ?? [];

  try {
    const auth = await authenticate(request);
    if ('error' in auth) return auth.error;
    const { supabase, orgId } = auth;

    const body = await request.json();
    const now  = new Date().toISOString();

    // PATCH /api/events/:id
    if (seg.length === 2 && seg[0] === 'events') {
      if (body.end_date) {
        const { data: org } = await buildServiceClient().from('organizations').select('plan').eq('id', orgId).single();
        if (!org || org.plan === 'free') {
          return fail('Multi-day events require a paid plan', 403);
        }
      }

      const { data, error } = await supabase
        .from('events')
        .update({ ...body, updated_at: now })
        .eq('id', seg[1])
        .eq('organization_id', orgId)   // scoped — prevents cross-org writes
        .select()
        .single();

      if (error) throw error;
      if (!data) return fail('Event not found', 404);
      return ok(data);
    }

    // PATCH /api/shifts/:id
    if (seg.length === 2 && seg[0] === 'shifts') {
      const { data, error } = await supabase
        .from('shifts')
        .update({ ...body, updated_at: now })
        .eq('id', seg[1])
        .select()
        .single();

      if (error) throw error;
      if (!data) return fail('Shift not found', 404);
      return ok(data);
    }

    return fail('Not found', 404);
  } catch (e: any) {
    console.error('[PATCH]', e);
    return fail(e.message ?? 'Internal server error', e.status ?? 500);
  }
}

// ---------------------------------------------------------------------------
// DELETE — all protected
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { path } = await params;
  const seg = path ?? [];
  const hard = request.nextUrl.searchParams.get('hard') === 'true';

  try {
    const auth = await authenticate(request);
    if ('error' in auth) return auth.error;
    const { supabase, orgId } = auth;

    // DELETE /api/events/:id  (soft by default, ?hard=true for permanent)
    if (seg.length === 2 && seg[0] === 'events') {
      if (hard) {
        const { error } = await supabase
          .from('events')
          .delete()
          .eq('id', seg[1])
          .eq('organization_id', orgId);

        if (error) throw error;
        return ok({ id: seg[1], deleted: true });
      }

      const { data, error } = await supabase
        .from('events')
        .update({ status: 'deleted', updated_at: new Date().toISOString() })
        .eq('id', seg[1])
        .eq('organization_id', orgId)
        .select()
        .single();

      if (error) throw error;
      if (!data) return fail('Event not found', 404);
      return ok(data);
    }

    // DELETE /api/shifts/:id
    // ⚠️  If shift_registrations has a FK → shifts without ON DELETE CASCADE,
    //     delete registrations first or add the cascade to your schema.
    if (seg.length === 2 && seg[0] === 'shifts') {
      const { error } = await supabase
        .from('shifts')
        .delete()
        .eq('id', seg[1]);

      if (error) throw error;
      return ok({ id: seg[1], deleted: true });
    }

    return fail('Not found', 404);
  } catch (e: any) {
    console.error('[DELETE]', e);
    return fail(e.message ?? 'Internal server error', e.status ?? 500);
  }
}