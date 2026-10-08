// Pure decision logic for PATCH /api/volunteer-registrations/[id]'s role
// reassignment, extracted out of the route so it can be unit-tested without
// mocking next/headers/@supabase/ssr (the route's auth layer is identical
// boilerplate shared by dozens of other routes — the capacity/anchor
// arithmetic here is the actual thing that's broken before, so that's what
// gets pure, synchronous, zero-mock test coverage).
//
// attendee_type isn't just a label — a row's shift_id/panel_id anchor
// determines what capacity it counts against, so a role change sometimes
// also means leaving that anchor:
//  - shift-anchored -> attendee/speaker: leaves the shift (shift_id cleared),
//    gated by the event's attendee/speaker settings.
//  - panel-anchored -> attendee/speaker/volunteer: stays on the panel, free
//    flip in any direction against the panel's one shared capacity pool —
//    never capacity-checked, since an in-place update never changes the
//    panel's real confirmed headcount (see app/api/events/[id]/panels/route.ts).
//  - unanchored (shiftless volunteer / attendee / event-level speaker):
//    reassign freely among the three, each gated by its own event setting.
// A reselection of the current value is always a no-op and never
// capacity-checked — the row already counts toward its own bucket, so a
// fresh count would wrongly reject an at-capacity no-op.

export const VALID_ATTENDEE_TYPES = ['volunteer', 'attendee', 'speaker'] as const;
export type AttendeeType = typeof VALID_ATTENDEE_TYPES[number];
export type Anchor = 'shift' | 'panel' | 'event';

export interface RoleReassignmentEvent {
  attendee_enabled: boolean;
  attendee_capacity: number | null;
  speaker_enabled: boolean;
  is_shiftless: boolean;
  shiftless_capacity: number | null;
}

export interface RoleReassignmentCounts {
  // Pre-fetched by the caller — only when countsNeededFor() said so, never
  // speculatively.
  attendeeCount?: number;
  shiftlessVolunteerCount?: number;
}

export interface RoleReassignmentInput {
  currentAnchor: Anchor;
  currentType: AttendeeType;
  newType: AttendeeType;
  event: RoleReassignmentEvent;
  counts: RoleReassignmentCounts;
}

export interface CountsNeeded {
  attendeeCount: boolean;
  shiftlessVolunteerCount: boolean;
}

export interface RoleReassignmentError {
  message: string;
  status: 400 | 409;
}

export interface RoleReassignmentResult {
  error: RoleReassignmentError | null;
  updates: Record<string, unknown>;
}

// Call this FIRST and fetch only what it asks for (and only when the
// corresponding event capacity is actually set), then pass the results to
// planRoleReassignment. Mirrors planRoleReassignment's own branches exactly,
// so a caller never fetches a count that would go unused, and
// planRoleReassignment never needs a count the caller didn't supply.
export function countsNeededFor(
  input: Pick<RoleReassignmentInput, 'currentAnchor' | 'currentType' | 'newType' | 'event'>
): CountsNeeded {
  const { currentAnchor, currentType, newType, event } = input;

  // currentAnchor === 'panel' never needs a count — always a free in-place
  // flip, regardless of newType.
  const isRealTransition =
    (currentAnchor === 'shift' && newType !== 'volunteer') ||
    (currentAnchor === 'event' && newType !== currentType);

  return {
    attendeeCount: isRealTransition && newType === 'attendee' && !!event.attendee_capacity,
    shiftlessVolunteerCount: isRealTransition && newType === 'volunteer' && !!event.shiftless_capacity,
  };
}

export function planRoleReassignment(input: RoleReassignmentInput): RoleReassignmentResult {
  const { currentAnchor, currentType, newType, event, counts } = input;
  const updates: Record<string, unknown> = { attendee_type: newType };

  function attendeeCapacityError(): RoleReassignmentError | null {
    if (!event.attendee_enabled) return { message: 'Event does not allow attendee registration', status: 400 };
    if (event.attendee_capacity && (counts.attendeeCount ?? 0) >= event.attendee_capacity) {
      return { message: 'This event is full', status: 409 };
    }
    return null;
  }

  function shiftlessCapacityError(): RoleReassignmentError | null {
    if (!event.is_shiftless) return { message: 'Event does not allow shiftless registration', status: 400 };
    if (event.shiftless_capacity && (counts.shiftlessVolunteerCount ?? 0) >= event.shiftless_capacity) {
      return { message: 'This event is full', status: 409 };
    }
    return null;
  }

  function speakerError(): RoleReassignmentError | null {
    return event.speaker_enabled ? null : { message: 'Event does not allow speaker registration', status: 400 };
  }

  if (currentAnchor === 'shift') {
    if (newType !== 'volunteer') {
      // Leaving the shift for an event-level role.
      const err = newType === 'attendee' ? attendeeCapacityError() : speakerError();
      if (err) return { error: err, updates: {} };
      updates.shift_id = null;
      updates.is_waitlisted = false;
    }
    // newType === 'volunteer' while already shift-anchored is a no-op —
    // nothing to update, no check needed.
  } else if (currentAnchor === 'panel') {
    updates.is_waitlisted = false;
  } else if (newType !== currentType) {
    const err = newType === 'attendee' ? attendeeCapacityError()
      : newType === 'volunteer' ? shiftlessCapacityError()
      : speakerError();
    if (err) return { error: err, updates: {} };
    updates.is_waitlisted = false;
  }

  return { error: null, updates };
}
