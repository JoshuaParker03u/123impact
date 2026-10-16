import { NextRequest, NextResponse } from 'next/server';
import { buildOrgFeedData } from '@/lib/public-feed/build-feed-data';
import { buildEventsJson } from '@/lib/public-feed/to-json';
import { resolveOrgIdFromPublicId } from '@/lib/org-public-id';

type Params = { params: Promise<{ publicId: string }> };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60' };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// GET /api/public/organizations/[publicId]/events.json
// Public, no-auth, cross-origin feed of an org's events/sessions/people.
// Any org with events already has a feed at this URL — no opt-in toggle.
// Keyed on the org's public_id (a one-way hash of its real id, see
// lib/org-public-id.ts), not the raw database id — this route never sees
// or needs the real id beyond this one lookup.
export async function GET(_req: NextRequest, { params }: Params) {
  const { publicId } = await params;
  const orgId = await resolveOrgIdFromPublicId(publicId);
  if (!orgId) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404, headers: CORS_HEADERS });
  }

  const data = await buildOrgFeedData(orgId);
  if (!data) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404, headers: CORS_HEADERS });
  }

  return NextResponse.json(buildEventsJson(data), { headers: { ...CORS_HEADERS, ...CACHE_HEADERS } });
}
