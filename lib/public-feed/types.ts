// Shared shape produced by buildOrgFeedData() and consumed by both the JSON
// and iCal serializers, so the two formats can never drift on what counts
// as "consented" or how a status/URL is derived — that logic lives once, in
// build-feed-data.ts.

import type { FeedEventStatus } from './derive-status';

export interface FeedPerson {
  id: string;
  name: string;
  bio: string | null;
  photo: string | null;
  topic: string | null;
}

export interface FeedSessionPerson {
  person: string; // FeedPerson.id
  role: 'speaker' | 'volunteer' | 'moderator';
}

export interface FeedSession {
  id: string;
  title: string;
  description: string | null;
  starts: Date;
  ends: Date;
  location: string | null;
  online_url: string | null;
  streamed: boolean;
  people: FeedSessionPerson[];
}

export interface FeedEvent {
  id: string; // events.event_id slug
  title: string;
  description: string | null;
  status: FeedEventStatus;
  starts: Date;
  ends: Date;
  image: string | null;
  location: string | null;
  online_url: string | null;
  recording_url: string | null;
  apply_url: string;
  venue_name: string | null; // best-effort Discord guild display name
  sessions: FeedSession[];
  people: FeedPerson[];
}

export interface OrgFeedData {
  organization_id: string;
  organization_name: string;
  time_zone: string | null; // null -> emit UTC
  events: FeedEvent[];
}
