import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/api-keys';
import { buildOrgExport, parseFormatParam, parseIncludeParam } from '@/lib/api-v1/build-org-export';

// GET /api/v1/organizations/me
// Admin-level, read-only export of essentially everything the authenticated
// org owns -- gated by a Bearer API key (see lib/api-keys.ts), not a
// session. No write support yet.
//
// Query params:
//   format=full|safe|sparse|public (default full)
//     full   - every field below, unredacted, including registrant PII.
//     safe   - same resources/nesting as full, PII stripped from every
//              person-like record (email, phone, discord_user_id, discord_username).
//     sparse - same resource set, each record trimmed to a small summary
//              shape, no nested sub-collections. Implies safe.
//     public - the exact same shape the no-auth public feed already
//              returns (lib/public-feed). `include` is ignored in this mode.
//   include=events,registrations,... (default: every resource key) -- a
//     comma-separated allowlist of top-level resource keys to return.
//     Anything not listed is omitted from the response entirely.
//
// Hard exclusions regardless of format/include: organizations.stripe_*,
// platform_connections.access_token/refresh_token/token_expires_at,
// event_admin_assignments.token, event_speaker_invites.token,
// org_custom_domains.verification_token. See build-org-export.ts.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if ('error' in auth) return auth.error;

  const format = parseFormatParam(req.nextUrl.searchParams.get('format'));
  const include = parseIncludeParam(req.nextUrl.searchParams.get('include'));

  const data = await buildOrgExport(auth.organizationId, { format, include });
  return NextResponse.json(data);
}
