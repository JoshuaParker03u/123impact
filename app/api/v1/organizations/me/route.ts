import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/api-keys';
import { buildOrgExport } from '@/lib/api-v1/build-org-export';
import { resolveExportRequest } from '@/lib/api-v1/resolve-export-request';

// GET /api/v1/organizations/me
// Admin-level, read-only export of essentially everything the authenticated
// org owns -- gated by a Bearer API key (see lib/api-keys.ts), not a
// session. No write support yet.
//
// Query params:
//   format=full|safe|sparse|public (default full) -- an unrecognized value
//     is a 400, never a silent fallback to full.
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
// A key can optionally be scoped to specific formats/resources at
// generation time (see app/api/organizations/[id]/api-keys/route.ts) --
// requesting a format or resource outside that scope is a 403. See
// resolveExportRequest for the exact rules.
//
// Hard exclusions regardless of format/include: organizations.stripe_*,
// platform_connections.access_token/refresh_token/token_expires_at,
// event_admin_assignments.token, event_speaker_invites.token,
// org_custom_domains.verification_token. See build-org-export.ts.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if ('error' in auth) return auth.error;

  const resolved = resolveExportRequest({
    formatParam: req.nextUrl.searchParams.get('format'),
    includeParam: req.nextUrl.searchParams.get('include'),
    allowedFormats: auth.allowedFormats,
    allowedResources: auth.allowedResources,
  });
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error.message }, { status: resolved.error.status });
  }

  const data = await buildOrgExport(auth.organizationId, resolved);
  return NextResponse.json(data);
}
