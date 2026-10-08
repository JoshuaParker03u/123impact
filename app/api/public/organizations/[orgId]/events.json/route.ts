import { NextRequest, NextResponse } from 'next/server';
import { buildOrgFeedData } from '@/lib/public-feed/build-feed-data';

type Params = { params: Promise<{ orgId: string }> };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60' };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// GET /api/public/organizations/[orgId]/events.json
// Public, no-auth, cross-origin feed of an org's events/sessions/people.
// Any org with events already has a feed at this URL — no opt-in toggle
// (org ids are already treated as non-sensitive elsewhere in this app, e.g.
// the X-Organization-Id header on GET /api/events).
export async function GET(_req: NextRequest, { params }: Params) {
  const { orgId } = await params;
  const data = await buildOrgFeedData(orgId);

  if (!data) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404, headers: CORS_HEADERS });
  }

  const timeZone = data.time_zone ?? 'UTC';

  return NextResponse.json({
    schema: 'ngu.events.v1',
    generated: new Date().toISOString(),
    events: data.events.map(event => ({
      id: event.id,
      name: event.title,
      status: event.status,
      starts: event.starts.toISOString(),
      ends: event.ends.toISOString(),
      time_zone: timeZone,
      summary: event.description?.slice(0, 200) ?? null,
      description: event.description,
      image: event.image ? { url: event.image } : null,
      links: {
        apply: event.apply_url,
        join: event.online_url,
        watch: event.online_url,
        recording: event.recording_url,
      },
      venues: event.venue_name ? [{ id: 'primary', name: event.venue_name }] : [],
      sessions: event.sessions.map(session => ({
        id: session.id,
        title: session.title,
        starts: session.starts.toISOString(),
        ends: session.ends.toISOString(),
        venue: session.location,
        description: session.description,
        streamed: session.streamed,
        people: session.people,
      })),
      people: event.people,
    })),
  }, { headers: { ...CORS_HEADERS, ...CACHE_HEADERS } });
}
