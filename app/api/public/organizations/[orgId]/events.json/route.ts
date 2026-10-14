import { NextRequest, NextResponse } from 'next/server';
import { buildOrgFeedData } from '@/lib/public-feed/build-feed-data';
import { buildEventsJson } from '@/lib/public-feed/to-json';

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

  return NextResponse.json(buildEventsJson(data), { headers: { ...CORS_HEADERS, ...CACHE_HEADERS } });
}
