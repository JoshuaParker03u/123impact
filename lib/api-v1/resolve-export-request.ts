// Pure request-side validation/authorization for GET /api/v1/organizations/me
// -- extracted out of the route so every rule here is unit-testable without
// mocking auth or the DB, same rationale as resolveSignupRoute and
// role-reassignment.ts. Resolves the raw format/include query params plus
// the authenticated key's own restrictions into either an error (with the
// right HTTP status) or the exact { format, include } to hand to
// buildOrgExport unchanged.
import { EXPORT_RESOURCE_KEYS, type ExportFormat, type ExportResourceKey } from './build-org-export';

export const EXPORT_FORMATS: ExportFormat[] = ['full', 'safe', 'sparse', 'public'];

export type ExportAuthzError = { message: string; status: 400 | 403 };
export type ExportAuthzResult =
  | { error: ExportAuthzError }
  | { format: ExportFormat; include: ExportResourceKey[] };

export function resolveExportRequest(input: {
  formatParam: string | null;
  includeParam: string | null;
  allowedFormats: string[] | null;
  allowedResources: string[] | null;
}): ExportAuthzResult {
  // 1. Parse format -- absent means the default; present-but-unrecognized is
  // a hard error, never a silent fallback to the most permissive option.
  let format: ExportFormat;
  if (input.formatParam === null) {
    format = 'full';
  } else if ((EXPORT_FORMATS as string[]).includes(input.formatParam)) {
    format = input.formatParam as ExportFormat;
  } else {
    return {
      error: {
        message: `Invalid format "${input.formatParam}". Must be one of: ${EXPORT_FORMATS.join(', ')}.`,
        status: 400,
      },
    };
  }

  // 2. Format permission -- applies even to format=public.
  if (input.allowedFormats && !input.allowedFormats.includes(format)) {
    return { error: { message: `This API key is not permitted to use format=${format}.`, status: 403 } };
  }

  // format=public ignores include entirely -- buildOrgExport delegates
  // wholesale to the public feed builder, which has its own fixed shape.
  if (format === 'public') {
    return { format, include: [] };
  }

  // 3. Resolve include. Absent means "everything" -- then silently narrowed
  // to what this key is allowed to see, no error (the client didn't ask for
  // anything specific). Present and naming a resource this key isn't scoped
  // for is a hard error instead, since that's a specific, refused request,
  // not a default. An unrecognized key (not in EXPORT_RESOURCE_KEYS at all)
  // stays a silent filter either way -- that's an unrelated, lower-stakes
  // case (a typo/unknown key, not "this key is not permitted").
  const explicitlyRequested = input.includeParam !== null;
  const requested = explicitlyRequested
    ? input.includeParam!.split(',').map((s) => s.trim()).filter(Boolean)
    : [...EXPORT_RESOURCE_KEYS];
  const validRequested = EXPORT_RESOURCE_KEYS.filter((key) => requested.includes(key));

  if (!input.allowedResources) {
    return { format, include: validRequested };
  }

  if (explicitlyRequested) {
    const disallowed = validRequested.filter((key) => !input.allowedResources!.includes(key));
    if (disallowed.length > 0) {
      return { error: { message: `This API key is not permitted to access: ${disallowed.join(', ')}.`, status: 403 } };
    }
    return { format, include: validRequested };
  }

  return { format, include: validRequested.filter((key) => input.allowedResources!.includes(key)) };
}

export type KeyRestrictions = { allowedFormats: string[] | null; allowedResources: string[] | null; expiresAt: string | null };

// Validates the optional scoping/expiry fields on POST
// /api/organizations/[id]/api-keys. An empty array is treated the same as
// omitted (unrestricted) rather than "restricted to nothing" -- an admin
// unchecking every box in the UI almost certainly means "I changed my mind
// about restricting this", not "block every format".
export function validateKeyRestrictions(input: {
  allowed_formats?: unknown;
  allowed_resources?: unknown;
  expires_at?: unknown;
}): { error: string } | KeyRestrictions {
  let allowedFormats: string[] | null = null;
  if (input.allowed_formats != null) {
    if (!Array.isArray(input.allowed_formats) || !input.allowed_formats.every((f) => (EXPORT_FORMATS as string[]).includes(f))) {
      return { error: `allowed_formats must be a subset of: ${EXPORT_FORMATS.join(', ')}.` };
    }
    allowedFormats = input.allowed_formats.length > 0 ? input.allowed_formats : null;
  }

  let allowedResources: string[] | null = null;
  if (input.allowed_resources != null) {
    if (!Array.isArray(input.allowed_resources) || !input.allowed_resources.every((r) => (EXPORT_RESOURCE_KEYS as readonly string[]).includes(r))) {
      return { error: `allowed_resources must be a subset of: ${EXPORT_RESOURCE_KEYS.join(', ')}.` };
    }
    allowedResources = input.allowed_resources.length > 0 ? input.allowed_resources : null;
  }

  let expiresAt: string | null = null;
  if (input.expires_at != null) {
    if (typeof input.expires_at !== 'string') return { error: 'expires_at must be an ISO date string.' };
    const parsed = new Date(input.expires_at);
    if (Number.isNaN(parsed.getTime())) return { error: 'expires_at is not a valid date.' };
    if (parsed.getTime() <= Date.now()) return { error: 'expires_at must be in the future.' };
    expiresAt = parsed.toISOString();
  }

  return { allowedFormats, allowedResources, expiresAt };
}
