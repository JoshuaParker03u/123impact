// Derives the public feed's event status (upcoming/live/past/cancelled) from
// dates rather than trusting events.status's 'ongoing'/'completed' values,
// which are admin-set and go stale (an org that never flips an event to
// 'completed' would otherwise show a months-old event as perpetually
// upcoming in an external feed, with nobody around to notice). Only
// 'cancelled' and the 'deleted' exclusion are taken from the stored status —
// everything else is computed from `start`/`end` against `now`.
//
// Deliberately takes already-computed Date instants rather than raw
// date/time strings + a timezone — that keeps this function pure and
// dependency-free (plain objects in, no date-fns-tz here), with the
// timezone-aware wall-clock -> instant conversion done once by the caller
// (lib/public-feed/build-feed-data.ts).

export type StoredEventStatus = 'active' | 'ongoing' | 'cancelled' | 'completed' | 'deleted';
export type FeedEventStatus = 'upcoming' | 'live' | 'past' | 'cancelled';

export interface DeriveStatusInput {
  status: StoredEventStatus;
  start: Date;
  end: Date;
  now: Date;
}

// null return means "exclude from the feed entirely" (status === 'deleted').
export function deriveFeedStatus(input: DeriveStatusInput): FeedEventStatus | null {
  const { status, start, end, now } = input;

  if (status === 'deleted') return null;
  if (status === 'cancelled') return 'cancelled';
  if (now < start) return 'upcoming';
  if (now > end) return 'past';
  return 'live';
}
