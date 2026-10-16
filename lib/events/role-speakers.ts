// A "role speaker" is a volunteer_registrations row with attendee_type=
// 'speaker' that got there via a role change (e.g. the shift-tab RoleSelect
// dropdown) rather than accepting an invite token. Those two origins share
// the same attendee_type, so a plain query for unanchored speakers would
// also pick up invited-and-accepted ones -- which already have their own
// home in the Speaker Invites tab's main list -- and show them twice.
// Extracted as a pure function (no DB/auth mocking needed) following the
// same pattern as lib/volunteer-registrations/role-reassignment.ts and
// lib/messages/dedupe-recipients.ts.
export function excludeInvitedSpeakers<T extends { id: string }>(
  registrations: T[],
  invitedRegistrationIds: (string | null)[]
): T[] {
  const invited = new Set(invitedRegistrationIds.filter((id): id is string => !!id));
  return registrations.filter((r) => !invited.has(r.id));
}
