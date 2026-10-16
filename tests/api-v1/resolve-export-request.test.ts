// Regression coverage for GET /api/v1/organizations/me's request-side
// validation/authorization: an unrecognized format must be a hard error
// (never a silent fallback to the most permissive option), and a key
// restricted to specific formats/resources must actually be enforced --
// silently for an unspecified default, explicitly (403) for a refused
// request.
import { describe, it, expect } from 'vitest';
import { resolveExportRequest, validateKeyRestrictions, EXPORT_FORMATS } from '@/lib/api-v1/resolve-export-request';

const unrestricted = { allowedFormats: null, allowedResources: null };

describe('resolveExportRequest', () => {
  it('defaults format to full and include to every resource key when both are omitted', () => {
    const result = resolveExportRequest({ formatParam: null, includeParam: null, ...unrestricted });
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.format).toBe('full');
      expect(result.include).toEqual(['organization', 'events', 'registrations', 'admins', 'speaker_invites', 'custom_domains', 'platform_connections']);
    }
  });

  it('rejects an unrecognized format with a 400, not a silent fallback to full', () => {
    const result = resolveExportRequest({ formatParam: 'saef', includeParam: null, ...unrestricted });
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(400);
      expect(result.error.message).toMatch(/invalid format/i);
    }
  });

  it('filters include to only recognized keys, ignoring unknown ones (unrelated to key scoping)', () => {
    const result = resolveExportRequest({ formatParam: null, includeParam: 'events,bogus,registrations', ...unrestricted });
    expect('error' in result).toBe(false);
    if (!('error' in result)) expect(result.include).toEqual(['events', 'registrations']);
  });

  it('rejects a format this key is not allowed to use', () => {
    const result = resolveExportRequest({
      formatParam: 'full',
      includeParam: null,
      allowedFormats: ['safe', 'sparse'],
      allowedResources: null,
    });
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.status).toBe(403);
  });

  it('still enforces format restriction for format=public, and ignores include entirely in that mode', () => {
    const allowed = resolveExportRequest({
      formatParam: 'public',
      includeParam: 'registrations',
      allowedFormats: ['public'],
      allowedResources: ['events'],
    });
    expect('error' in allowed).toBe(false);
    if (!('error' in allowed)) expect(allowed.include).toEqual([]);

    const denied = resolveExportRequest({
      formatParam: 'public',
      includeParam: null,
      allowedFormats: ['full'],
      allowedResources: null,
    });
    expect('error' in denied).toBe(true);
    if ('error' in denied) expect(denied.error.status).toBe(403);
  });

  it('silently narrows the default include to what the key allows, when none was explicitly requested', () => {
    const result = resolveExportRequest({
      formatParam: null,
      includeParam: null,
      allowedFormats: null,
      allowedResources: ['events', 'registrations'],
    });
    expect('error' in result).toBe(false);
    if (!('error' in result)) expect(result.include).toEqual(['events', 'registrations']);
  });

  it('rejects an explicit include naming a resource this key is not allowed to access', () => {
    const result = resolveExportRequest({
      formatParam: null,
      includeParam: 'events,registrations,admins',
      allowedFormats: null,
      allowedResources: ['events'],
    });
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(403);
      expect(result.error.message).toMatch(/registrations/);
      expect(result.error.message).toMatch(/admins/);
    }
  });

  it('allows an explicit include fully contained in what the key allows', () => {
    const result = resolveExportRequest({
      formatParam: null,
      includeParam: 'events',
      allowedFormats: null,
      allowedResources: ['events', 'registrations'],
    });
    expect('error' in result).toBe(false);
    if (!('error' in result)) expect(result.include).toEqual(['events']);
  });
});

describe('validateKeyRestrictions', () => {
  it('accepts everything omitted/null as fully unrestricted', () => {
    const result = validateKeyRestrictions({});
    expect(result).toEqual({ allowedFormats: null, allowedResources: null, expiresAt: null });
  });

  it('treats an empty array the same as omitted -- not "restricted to nothing"', () => {
    const result = validateKeyRestrictions({ allowed_formats: [], allowed_resources: [] });
    expect(result).toEqual({ allowedFormats: null, allowedResources: null, expiresAt: null });
  });

  it('rejects an allowed_formats value outside the known enum', () => {
    const result = validateKeyRestrictions({ allowed_formats: ['safe', 'bogus'] });
    expect('error' in result).toBe(true);
  });

  it('rejects an allowed_resources value outside the known enum', () => {
    const result = validateKeyRestrictions({ allowed_resources: ['events', 'bogus'] });
    expect('error' in result).toBe(true);
  });

  it('accepts a valid restricted set', () => {
    const result = validateKeyRestrictions({ allowed_formats: ['safe', 'sparse'], allowed_resources: ['events'] });
    expect(result).toEqual({ allowedFormats: ['safe', 'sparse'], allowedResources: ['events'], expiresAt: null });
  });

  it('rejects an expires_at in the past', () => {
    const result = validateKeyRestrictions({ expires_at: new Date(Date.now() - 86400000).toISOString() });
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toMatch(/future/);
  });

  it('accepts a future expires_at', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const result = validateKeyRestrictions({ expires_at: future });
    expect('error' in result).toBe(false);
    if (!('error' in result)) expect(result.expiresAt).toBe(future);
  });

  it('EXPORT_FORMATS matches the four documented formats', () => {
    expect(EXPORT_FORMATS).toEqual(['full', 'safe', 'sparse', 'public']);
  });
});
