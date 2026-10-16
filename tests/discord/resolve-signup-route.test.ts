// Regression test for a real bug: the Discord bot's /signup flow checked
// shifts unconditionally before ever looking at panels_enabled, so an
// event configured with BOTH panels and real shifts could never offer its
// panels through the bot at all -- it always routed to the shift picker.
// Panels must take priority over shifts, matching the web signup page's
// own precedence (SignupPageClient.tsx).
import { describe, it, expect } from 'vitest';
import { resolveSignupRoute } from '@/lib/discord/resolve-signup-route';

const base = {
  panelsEnabled: false,
  openPanelCount: 0,
  hasAnyPanels: false,
  openShiftCount: 0,
  hasAnyShifts: false,
  attendeeEnabled: false,
  isShiftless: false,
};

describe('resolveSignupRoute', () => {
  it('routes to the panel picker when an event has BOTH open panels and open shifts', () => {
    const result = resolveSignupRoute({
      ...base,
      panelsEnabled: true,
      openPanelCount: 2,
      hasAnyPanels: true,
      openShiftCount: 3,
      hasAnyShifts: true,
    });
    expect(result).toEqual({ kind: 'panel_picker' });
  });

  it('routes to the shift picker when panels are not enabled for this event', () => {
    const result = resolveSignupRoute({
      ...base,
      openShiftCount: 3,
      hasAnyShifts: true,
    });
    expect(result).toEqual({ kind: 'shift_picker' });
  });

  it('routes to "no panels available" rather than falling through to shifts, when the event has panels but none open', () => {
    const result = resolveSignupRoute({
      ...base,
      panelsEnabled: true,
      openPanelCount: 0,
      hasAnyPanels: true,
      openShiftCount: 3,
      hasAnyShifts: true,
    });
    expect(result).toEqual({ kind: 'no_panels_available' });
  });

  it('falls through to shifts when panels_enabled is true but the event has no panels at all', () => {
    const result = resolveSignupRoute({
      ...base,
      panelsEnabled: true,
      openPanelCount: 0,
      hasAnyPanels: false,
      openShiftCount: 2,
      hasAnyShifts: true,
    });
    expect(result).toEqual({ kind: 'shift_picker' });
  });

  it('falls through to RSVP (attendee) when there are no panels and no shifts at all', () => {
    const result = resolveSignupRoute({ ...base, attendeeEnabled: true });
    expect(result).toEqual({ kind: 'rsvp', attendeeType: 'attendee' });
  });

  it('falls through to RSVP (volunteer) on a shiftless event with no panels', () => {
    const result = resolveSignupRoute({ ...base, isShiftless: true });
    expect(result).toEqual({ kind: 'rsvp', attendeeType: 'volunteer' });
  });

  it('is closed when there are no panels, no shifts, no attendee RSVP, and the event is not shiftless', () => {
    const result = resolveSignupRoute(base);
    expect(result).toEqual({ kind: 'closed' });
  });

  it('reports "no shifts available" rather than RSVP when the event has shifts but none open and no other path exists', () => {
    const result = resolveSignupRoute({ ...base, hasAnyShifts: true });
    expect(result).toEqual({ kind: 'no_shifts_available' });
  });
});
