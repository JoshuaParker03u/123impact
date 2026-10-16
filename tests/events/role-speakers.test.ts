// Regression test for a real bug: GET /api/events/[id]/shiftless-
// registrations?type=speaker was added to surface unanchored speakers
// promoted via a role change (shift -> speaker, etc.), which previously had
// no admin UI showing them at all. A speaker who instead came from an
// accepted invite token already has a home in the Speaker Invites tab's
// main list, so excludeInvitedSpeakers must filter those out to avoid
// showing the same person twice.
import { describe, it, expect } from 'vitest';
import { excludeInvitedSpeakers } from '@/lib/events/role-speakers';

describe('excludeInvitedSpeakers', () => {
  it('keeps a registration with no matching invite record', () => {
    const result = excludeInvitedSpeakers([{ id: 'r1' }], []);
    expect(result).toEqual([{ id: 'r1' }]);
  });

  it('drops a registration that has an accepted invite', () => {
    const result = excludeInvitedSpeakers(
      [{ id: 'r1' }, { id: 'r2' }],
      ['r1']
    );
    expect(result).toEqual([{ id: 'r2' }]);
  });

  it('ignores null registration_ids from invites that were never accepted', () => {
    // event_speaker_invites.registration_id is only set once an invite is
    // accepted -- a pending/expired/revoked invite's row has it as null,
    // and that null must never accidentally match anything.
    const result = excludeInvitedSpeakers([{ id: 'r1' }], [null, null]);
    expect(result).toEqual([{ id: 'r1' }]);
  });

  it('returns everything unchanged when nothing is invited', () => {
    const rows = [{ id: 'r1' }, { id: 'r2' }];
    expect(excludeInvitedSpeakers(rows, [])).toEqual(rows);
  });
});
