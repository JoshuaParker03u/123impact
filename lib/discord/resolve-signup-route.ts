// Pure decision logic for the Discord bot's /signup flow, extracted out of
// the interactions route so the panel-vs-shift precedence can be unit
// tested without mocking Discord's interaction payload shape or any DB call
// (same rationale as lib/volunteer-registrations/role-reassignment.ts).
//
// Panels take priority over shifts whenever an event has them -- same
// precedence as the web signup page (app/events/[eventId]/signup/
// SignupPageClient.tsx: panels.length > 0 means a volunteer picks a panel
// for that event, never a shift). A real bug this mirrors: checking shifts
// first unconditionally meant an event with both panels_enabled and real
// shifts configured could never offer its panels through the bot at all.
export type SignupRoute =
  | { kind: 'panel_picker' }
  | { kind: 'no_panels_available' }
  | { kind: 'shift_picker' }
  | { kind: 'no_shifts_available' }
  | { kind: 'rsvp'; attendeeType: 'attendee' | 'volunteer' }
  | { kind: 'closed' };

export function resolveSignupRoute(input: {
  panelsEnabled: boolean;
  openPanelCount: number;
  hasAnyPanels: boolean;
  openShiftCount: number;
  hasAnyShifts: boolean;
  attendeeEnabled: boolean;
  isShiftless: boolean;
}): SignupRoute {
  if (input.panelsEnabled) {
    if (input.openPanelCount > 0) return { kind: 'panel_picker' };
    if (input.hasAnyPanels) return { kind: 'no_panels_available' };
  }

  if (input.openShiftCount > 0) return { kind: 'shift_picker' };
  if (input.hasAnyShifts) return { kind: 'no_shifts_available' };

  if (!input.attendeeEnabled && !input.isShiftless) return { kind: 'closed' };
  return { kind: 'rsvp', attendeeType: input.attendeeEnabled ? 'attendee' : 'volunteer' };
}
