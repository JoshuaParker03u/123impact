import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import { wrapEmailHtml } from '@/lib/email-templates';

function buildServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function shiftsConflict(
  a: { start_time: string; end_time: string; shift_date: string | null },
  b: { start_time: string; end_time: string; shift_date: string | null },
  eventDate: string
): boolean {
  const dateA = a.shift_date ?? eventDate;
  const dateB = b.shift_date ?? eventDate;
  if (dateA !== dateB) return false;
  return a.start_time < b.end_time && a.end_time > b.start_time;
}

async function sendMultiShiftConfirmation(
  supabase: any,
  volunteerName: string,
  volunteerEmail: string,
  registeredShifts: { name: string; start_time: string; end_time: string; shift_date: string | null; is_waitlisted: boolean }[],
  eventId: string
) {
  const { data: event } = await supabase
    .from('events')
    .select('title, date, end_date, location')
    .eq('id', eventId)
    .single();

  if (!event) return;

  const dateDisplay = (event as any).end_date && (event as any).end_date !== (event as any).date
    ? `${(event as any).date} – ${(event as any).end_date}`
    : (event as any).date;

  const anyWaitlisted = registeredShifts.some(s => s.is_waitlisted);
  const allWaitlisted = registeredShifts.every(s => s.is_waitlisted);

  const shiftRows = registeredShifts.map(s => `
    <tr>
      <td style="padding:6px 0;font-weight:600;">${s.name}</td>
      <td style="padding:6px 0;color:#6b7280;">${s.shift_date ?? (event as any).date}</td>
      <td style="padding:6px 0;color:#6b7280;">${s.start_time} – ${s.end_time}</td>
      <td style="padding:6px 0;">${s.is_waitlisted ? '<span style="color:#d97706;">Waitlisted</span>' : '<span style="color:#16a34a;">Confirmed</span>'}</td>
    </tr>
  `).join('');

  const intro = allWaitlisted
    ? `You've been added to the waitlist for ${registeredShifts.length} shift${registeredShifts.length !== 1 ? 's' : ''} at <strong>${(event as any).title}</strong>. The coordinator will reach out if spots become available.`
    : anyWaitlisted
    ? `You're registered for <strong>${(event as any).title}</strong>. Some shifts are confirmed and some are waitlisted — see below.`
    : `Thank you for signing up to volunteer at <strong>${(event as any).title}</strong>. We look forward to seeing you!`;

  const html = wrapEmailHtml(`
    <h2>${allWaitlisted ? "You're on the Waitlist" : 'Registration Confirmed'}</h2>
    <p>Hi ${volunteerName},</p>
    <p>${intro}</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr><td style="padding:8px 0;color:#6b7280;width:120px;">Event</td><td style="padding:8px 0;font-weight:600;" colspan="3">${(event as any).title}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Date</td><td style="padding:8px 0;" colspan="3">${dateDisplay}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Location</td><td style="padding:8px 0;" colspan="3">${(event as any).location}</td></tr>
    </table>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr style="border-bottom:1px solid #e5e7eb;">
        <th style="padding:6px 0;text-align:left;color:#6b7280;font-weight:500;">Shift</th>
        <th style="padding:6px 0;text-align:left;color:#6b7280;font-weight:500;">Date</th>
        <th style="padding:6px 0;text-align:left;color:#6b7280;font-weight:500;">Time</th>
        <th style="padding:6px 0;text-align:left;color:#6b7280;font-weight:500;">Status</th>
      </tr>
      ${shiftRows}
    </table>
    <p>See you there!</p>
  `);

  const subjectStatus = allWaitlisted ? 'Waitlist' : anyWaitlisted ? 'Partially Confirmed' : 'Confirmed';
  await sendEmail({
    to: volunteerEmail,
    subject: `${subjectStatus}: ${registeredShifts.length} shift${registeredShifts.length !== 1 ? 's' : ''} at ${(event as any).title}`,
    html,
  });
}

// POST /api/volunteer-registrations/batch
// Registers a volunteer for multiple shifts in one atomic operation.
// Validates conflicts and capacity before inserting anything.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

  const { name, email, phone, attendee_type, shift_ids } = body;

  if (!name || !email) {
    return NextResponse.json({ error: 'name and email are required' }, { status: 400 });
  }
  if (!Array.isArray(shift_ids) || shift_ids.length === 0) {
    return NextResponse.json({ error: 'shift_ids must be a non-empty array' }, { status: 400 });
  }
  if (shift_ids.length > 10) {
    return NextResponse.json({ error: 'Cannot register for more than 10 shifts at once' }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const resolvedType = ['volunteer', 'attendee', 'speaker'].includes(attendee_type)
    ? attendee_type
    : 'volunteer';

  const supabase = buildServiceClient();

  // Fetch all requested shifts
  const { data: shifts, error: shiftError } = await supabase
    .from('shifts')
    .select('id, name, start_time, end_time, shift_date, capacity, allow_waitlist, event_id')
    .in('id', shift_ids);

  if (shiftError || !shifts || shifts.length !== shift_ids.length) {
    return NextResponse.json({ error: 'One or more shifts not found' }, { status: 404 });
  }

  // All shifts must belong to the same event
  const eventIds = new Set(shifts.map((s: any) => s.event_id));
  if (eventIds.size > 1) {
    return NextResponse.json({ error: 'All shifts must belong to the same event' }, { status: 400 });
  }
  const eventId = shifts[0].event_id as string;

  // Fetch event date for conflict detection on single-day events
  const { data: event } = await supabase
    .from('events')
    .select('date')
    .eq('id', eventId)
    .single();
  const eventDate = (event as any)?.date ?? '';

  // Server-side conflict check between submitted shifts
  for (let i = 0; i < shifts.length; i++) {
    for (let j = i + 1; j < shifts.length; j++) {
      if (shiftsConflict(shifts[i] as any, shifts[j] as any, eventDate)) {
        return NextResponse.json({
          error: `"${(shifts[i] as any).name}" and "${(shifts[j] as any).name}" overlap — you cannot register for both`,
        }, { status: 400 });
      }
    }
  }

  // Check for conflicts with shifts the volunteer is already registered for
  const { data: existingRegs } = await supabase
    .from('volunteer_registrations')
    .select('shift_id, shifts(id, name, start_time, end_time, shift_date)')
    .eq('event_id', eventId)
    .eq('email', normalizedEmail)
    .not('shift_id', 'is', null);

  for (const reg of existingRegs ?? []) {
    const existing = (reg as any).shifts;
    if (!existing) continue;
    for (const incoming of shifts) {
      if ((incoming as any).id === existing.id) continue; // same shift — duplicate check handles this
      if (shiftsConflict(existing, incoming as any, eventDate)) {
        return NextResponse.json({
          error: `"${(incoming as any).name}" conflicts with your existing registration for "${existing.name}"`,
        }, { status: 409 });
      }
    }
  }

  // Check capacity for each shift — all must pass before any insert
  const shiftStatuses: { shift: any; is_waitlisted: boolean }[] = [];

  for (const shift of shifts) {
    const { count: confirmed } = await supabase
      .from('volunteer_registrations')
      .select('*', { count: 'exact', head: true })
      .eq('shift_id', (shift as any).id)
      .eq('is_waitlisted', false);

    const isFull = (confirmed ?? 0) >= (shift as any).capacity;
    const isWaitlisted = isFull && (shift as any).allow_waitlist;

    if (isFull && !(shift as any).allow_waitlist) {
      return NextResponse.json({
        error: `"${(shift as any).name}" is full and does not have a waitlist`,
        fullShiftId: (shift as any).id,
      }, { status: 409 });
    }

    shiftStatuses.push({ shift, is_waitlisted: isWaitlisted });
  }

  // Insert all registrations
  const rows = shiftStatuses.map(({ shift, is_waitlisted }) => ({
    shift_id:      (shift as any).id,
    event_id:      eventId,
    name,
    email:         normalizedEmail,
    phone:         phone ?? null,
    attendee_type: resolvedType,
    is_waitlisted,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from('volunteer_registrations')
    .insert(rows)
    .select('id, shift_id, is_waitlisted');

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'You are already registered for one or more of these shifts' }, { status: 409 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Send one combined confirmation email
  const emailShifts = shiftStatuses.map(({ shift, is_waitlisted }) => ({
    name:        (shift as any).name,
    start_time:  (shift as any).start_time,
    end_time:    (shift as any).end_time,
    shift_date:  (shift as any).shift_date,
    is_waitlisted,
  }));

  sendMultiShiftConfirmation(supabase, name, normalizedEmail, emailShifts, eventId)
    .catch(e => console.error('sendMultiShiftConfirmation error:', e));

  return NextResponse.json({
    registrations: shiftStatuses.map(({ shift, is_waitlisted }) => ({
      shiftId:     (shift as any).id,
      shiftName:   (shift as any).name,
      isWaitlisted: is_waitlisted,
    })),
  }, { status: 201 });
}
