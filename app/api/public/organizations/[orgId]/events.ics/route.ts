import { NextRequest, NextResponse } from 'next/server';
import { buildOrgFeedData } from '@/lib/public-feed/build-feed-data';
import { buildIcal } from '@/lib/public-feed/to-ical';

type Params = { params: Promise<{ orgId: string }> };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};
const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60' };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// GET /api/public/organizations/[orgId]/events.ics
// Same underlying data as events.json, serialized as RFC 5545 — subscribable
// in calendar apps.
export async function GET(_req: NextRequest, { params }: Params) {
  const { orgId } = await params;
  const data = await buildOrgFeedData(orgId);

  if (!data) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404, headers: CORS_HEADERS });
  }

  const appDomain = (() => {
    try { return new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://123impact.org').hostname; }
    catch { return '123impact.org'; }
  })();

  const ics = buildIcal(data, appDomain);

  return new NextResponse(ics, {
    headers: {
      ...CORS_HEADERS,
      ...CACHE_HEADERS,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${orgId}-events.ics"`,
    },
  });
}
