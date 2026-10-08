// Pure unit tests — no database, no mocking. This is exactly the point of
// extracting planRoleReassignment()/countsNeededFor() out of the route: the
// capacity/anchor arithmetic that was actually buggy before can be tested
// with plain objects, with zero need to fake the session-auth layer around it.
import { describe, it, expect } from 'vitest';
import { countsNeededFor, planRoleReassignment, type RoleReassignmentEvent } from '@/lib/volunteer-registrations/role-reassignment';

const baseEvent: RoleReassignmentEvent = {
  attendee_enabled: true,
  attendee_capacity: null,
  speaker_enabled: true,
  is_shiftless: true,
  shiftless_capacity: null,
};

describe('shift-anchored transitions', () => {
  it('leaving the shift for attendee succeeds when attendee is enabled and uncapped', () => {
    const result = planRoleReassignment({
      currentAnchor: 'shift', currentType: 'volunteer', newType: 'attendee',
      event: baseEvent, counts: {},
    });
    expect(result.error).toBeNull();
    expect(result.updates).toMatchObject({ attendee_type: 'attendee', shift_id: null, is_waitlisted: false });
  });

  it('leaving the shift for attendee is rejected when attendee registration is disabled', () => {
    const result = planRoleReassignment({
      currentAnchor: 'shift', currentType: 'volunteer', newType: 'attendee',
      event: { ...baseEvent, attendee_enabled: false }, counts: {},
    });
    expect(result.error).toEqual({ message: 'Event does not allow attendee registration', status: 400 });
  });

  it('leaving the shift for attendee is rejected at capacity (409)', () => {
    const result = planRoleReassignment({
      currentAnchor: 'shift', currentType: 'volunteer', newType: 'attendee',
      event: { ...baseEvent, attendee_capacity: 5 }, counts: { attendeeCount: 5 },
    });
    expect(result.error).toEqual({ message: 'This event is full', status: 409 });
  });

  it('leaving the shift for attendee succeeds under capacity', () => {
    const result = planRoleReassignment({
      currentAnchor: 'shift', currentType: 'volunteer', newType: 'attendee',
      event: { ...baseEvent, attendee_capacity: 5 }, counts: { attendeeCount: 4 },
    });
    expect(result.error).toBeNull();
  });

  it('leaving the shift for speaker is rejected when speaker registration is disabled', () => {
    const result = planRoleReassignment({
      currentAnchor: 'shift', currentType: 'volunteer', newType: 'speaker',
      event: { ...baseEvent, speaker_enabled: false }, counts: {},
    });
    expect(result.error).toEqual({ message: 'Event does not allow speaker registration', status: 400 });
  });

  it('speaker is never capacity-checked (uncapped)', () => {
    const result = planRoleReassignment({
      currentAnchor: 'shift', currentType: 'volunteer', newType: 'speaker',
      event: baseEvent, counts: {},
    });
    expect(result.error).toBeNull();
    expect(result.updates).toMatchObject({ shift_id: null });
  });

  it('re-selecting volunteer while already shift-anchored is a pure no-op, never checked', () => {
    const result = planRoleReassignment({
      currentAnchor: 'shift', currentType: 'volunteer', newType: 'volunteer',
      event: baseEvent, counts: {},
    });
    expect(result.error).toBeNull();
    // No shift_id/is_waitlisted change — nothing actually happened.
    expect(result.updates).toEqual({ attendee_type: 'volunteer' });
  });
});

describe('panel-anchored transitions', () => {
  it('flips freely between all three types with no capacity check at all, even when "full"', () => {
    for (const newType of ['attendee', 'speaker', 'volunteer'] as const) {
      const result = planRoleReassignment({
        currentAnchor: 'panel', currentType: 'attendee', newType,
        // Deliberately impossible/zeroed-out settings — must not matter.
        event: { attendee_enabled: false, attendee_capacity: 0, speaker_enabled: false, is_shiftless: false, shiftless_capacity: 0 },
        counts: { attendeeCount: 999, shiftlessVolunteerCount: 999 },
      });
      expect(result.error).toBeNull();
      expect(result.updates).toEqual({ attendee_type: newType, is_waitlisted: false });
    }
  });

  it('never touches shift_id/panel_id — stays on the panel', () => {
    const result = planRoleReassignment({
      currentAnchor: 'panel', currentType: 'speaker', newType: 'volunteer',
      event: baseEvent, counts: {},
    });
    expect(result.updates).not.toHaveProperty('shift_id');
    expect(result.updates).not.toHaveProperty('panel_id');
  });
});

describe('unanchored (event-level) transitions', () => {
  it('attendee -> volunteer succeeds when shiftless is enabled and uncapped', () => {
    const result = planRoleReassignment({
      currentAnchor: 'event', currentType: 'attendee', newType: 'volunteer',
      event: baseEvent, counts: {},
    });
    expect(result.error).toBeNull();
  });

  it('attendee -> volunteer is rejected when shiftless registration is disabled', () => {
    const result = planRoleReassignment({
      currentAnchor: 'event', currentType: 'attendee', newType: 'volunteer',
      event: { ...baseEvent, is_shiftless: false }, counts: {},
    });
    expect(result.error).toEqual({ message: 'Event does not allow shiftless registration', status: 400 });
  });

  it('attendee -> volunteer is rejected at shiftless capacity (409)', () => {
    const result = planRoleReassignment({
      currentAnchor: 'event', currentType: 'attendee', newType: 'volunteer',
      event: { ...baseEvent, shiftless_capacity: 2 }, counts: { shiftlessVolunteerCount: 2 },
    });
    expect(result.error).toEqual({ message: 'This event is full', status: 409 });
  });

  it('volunteer -> attendee is rejected at attendee capacity (409)', () => {
    const result = planRoleReassignment({
      currentAnchor: 'event', currentType: 'volunteer', newType: 'attendee',
      event: { ...baseEvent, attendee_capacity: 1 }, counts: { attendeeCount: 1 },
    });
    expect(result.error).toEqual({ message: 'This event is full', status: 409 });
  });

  it('the CRITICAL case — re-selecting the current type at an already-full bucket is never rejected', () => {
    // currentType === newType === 'attendee', attendee_capacity is already
    // at/over its limit. A naive "count current rows and compare" check
    // would wrongly reject this, since the row itself is already counted.
    const result = planRoleReassignment({
      currentAnchor: 'event', currentType: 'attendee', newType: 'attendee',
      event: { ...baseEvent, attendee_capacity: 1 }, counts: { attendeeCount: 1 },
    });
    expect(result.error).toBeNull();
    expect(result.updates).toEqual({ attendee_type: 'attendee' });
  });
});

describe('countsNeededFor — matches exactly what planRoleReassignment branches on, never over-fetches', () => {
  it('needs nothing for a panel-anchored transition, regardless of destination or capacity settings', () => {
    for (const newType of ['attendee', 'speaker', 'volunteer'] as const) {
      expect(countsNeededFor({
        currentAnchor: 'panel', currentType: 'attendee', newType,
        event: { ...baseEvent, attendee_capacity: 5, shiftless_capacity: 5 },
      })).toEqual({ attendeeCount: false, shiftlessVolunteerCount: false });
    }
  });

  it('needs nothing for a shift-anchored no-op (re-selecting volunteer)', () => {
    expect(countsNeededFor({
      currentAnchor: 'shift', currentType: 'volunteer', newType: 'volunteer',
      event: { ...baseEvent, attendee_capacity: 5 },
    })).toEqual({ attendeeCount: false, shiftlessVolunteerCount: false });
  });

  it('needs attendeeCount for shift -> attendee only when attendee_capacity is actually set', () => {
    expect(countsNeededFor({
      currentAnchor: 'shift', currentType: 'volunteer', newType: 'attendee',
      event: baseEvent, // attendee_capacity: null
    })).toEqual({ attendeeCount: false, shiftlessVolunteerCount: false });

    expect(countsNeededFor({
      currentAnchor: 'shift', currentType: 'volunteer', newType: 'attendee',
      event: { ...baseEvent, attendee_capacity: 5 },
    })).toEqual({ attendeeCount: true, shiftlessVolunteerCount: false });
  });

  it('needs nothing for shift -> speaker (speaker is never capacity-checked)', () => {
    expect(countsNeededFor({
      currentAnchor: 'shift', currentType: 'volunteer', newType: 'speaker',
      event: baseEvent,
    })).toEqual({ attendeeCount: false, shiftlessVolunteerCount: false });
  });

  it('needs nothing for an unanchored no-op (re-selecting the current type)', () => {
    expect(countsNeededFor({
      currentAnchor: 'event', currentType: 'attendee', newType: 'attendee',
      event: { ...baseEvent, attendee_capacity: 1 },
    })).toEqual({ attendeeCount: false, shiftlessVolunteerCount: false });
  });

  it('needs shiftlessVolunteerCount for a real unanchored move to volunteer, only when capped', () => {
    expect(countsNeededFor({
      currentAnchor: 'event', currentType: 'attendee', newType: 'volunteer',
      event: { ...baseEvent, shiftless_capacity: 5 },
    })).toEqual({ attendeeCount: false, shiftlessVolunteerCount: true });
  });
});
