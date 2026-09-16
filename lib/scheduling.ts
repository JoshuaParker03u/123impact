import { SupabaseClient } from '@supabase/supabase-js';
import { parseEmailTemplate } from '@/lib/email-templates';

// ---------------------------------------------------------------------------
// scheduleAutomatedEmails
// Called after a successful public registration to queue any automated
// emails defined for the event. Anchors reminder offsets to whichever of
// the three registration shapes applies: a shift's start time, a panel's
// start time, or (when neither is given) the event's own date/time — the
// latter covers shiftless-Volunteer/Attendee RSVPs, which still benefit
// from an event-day reminder the same way a shift volunteer does.
// ---------------------------------------------------------------------------

export async function scheduleAutomatedEmails(
  supabase: SupabaseClient,
  registrationId: string,
  volunteerName: string,
  volunteerEmail: string,
  eventId: string,
  shiftId: string | null,
  panelId: string | null = null
) {
  let anchor: Date;
  let eventTitle: string;
  let eventDescription: string;
  let location: string;
  let shiftEnd: Date | null = null;

  if (shiftId) {
    const { data: shift } = await supabase
      .from('shifts')
      .select('*, events(*)')
      .eq('id', shiftId)
      .single();

    if (!shift) return;

    // shift_date/start_time/end_time are "YYYY-MM-DD"/"HH:MM" text, not
    // full timestamps — must be combined into an ISO-ish string before
    // Date can parse them. Passing start_time alone (e.g. new Date("09:00"))
    // produces an Invalid Date whose downstream .toISOString() call throws.
    anchor = new Date(`${shift.shift_date ?? shift.events.date}T${shift.start_time}`);
    shiftEnd = new Date(`${shift.shift_date ?? shift.events.date}T${shift.end_time}`);
    eventTitle = shift.events.title;
    eventDescription = shift.events.description || '';
    location = shift.location;
  } else if (panelId) {
    const { data: panel } = await supabase
      .from('panels')
      .select('*, events(*)')
      .eq('id', panelId)
      .single();

    if (!panel) return;

    anchor = new Date(`${panel.panel_date ?? panel.events.date}T${panel.start_time}`);
    shiftEnd = new Date(`${panel.panel_date ?? panel.events.date}T${panel.end_time}`);
    eventTitle = panel.events.title;
    eventDescription = panel.events.description || '';
    location = panel.location || panel.events.location;
  } else {
    const { data: event } = await supabase
      .from('events')
      .select('title, description, date, time, location')
      .eq('id', eventId)
      .single();

    if (!event) return;

    anchor = new Date(`${event.date}T${event.time}`);
    eventTitle = event.title;
    eventDescription = event.description || '';
    location = event.location;
  }

  // Get enabled templates for this event
  const { data: templates } = await supabase
    .from('automated_email_templates')
    .select('*')
    .eq('event_id', eventId)
    .eq('enabled', true);

  if (!templates || templates.length === 0) return;

  const scheduledEmails = templates
    .map((template: any) => {
      let scheduledFor: Date;

      switch (template.trigger_type) {
        case 'signup':
          scheduledFor = new Date();
          break;
        case '7_days_before':
          scheduledFor = new Date(anchor.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '24_hours_before':
          scheduledFor = new Date(anchor.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '1_hour_before':
          scheduledFor = new Date(anchor.getTime() - 60 * 60 * 1000);
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
        event_name:        eventTitle,
        event_description: eventDescription,
        shift_date:        anchor.toLocaleDateString(),
        shift_start_time:  anchor.toLocaleTimeString(),
        shift_end_time:    shiftEnd ? shiftEnd.toLocaleTimeString() : '',
        shift_location:    location,
        hours_until_shift: Math.floor((anchor.getTime() - Date.now()) / (1000 * 60 * 60)),
      };

      const subject = parseEmailTemplate(template.subject, variables);
      const body    = parseEmailTemplate(template.body, variables);

      return {
        template_id:                template.id,
        volunteer_registration_id:  registrationId,
        volunteer_name:             volunteerName,
        volunteer_email:            volunteerEmail,
        event_id:                   eventId,
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
