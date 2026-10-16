// Regression coverage for the per-org Bearer API key system: keys are
// never stored or comparable in plaintext (only a hash), a revoked key
// stops authenticating, and authenticateApiKey resolves the right
// organization for a valid key.
import { describe, it, expect, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { generateApiKey, authenticateApiKey } from '@/lib/api-keys';
import { createTestOrg, cleanupOrg } from './helpers/fixtures';
import { getServiceClient } from './helpers/client';

function requestWithAuth(authorization?: string): NextRequest {
  return new NextRequest('http://localhost/api/whatever', {
    headers: authorization ? { authorization } : undefined,
  });
}

describe('generateApiKey', () => {
  it('produces a key with the expected prefix and a matching hash', () => {
    const { fullKey, prefix, hash } = generateApiKey();
    expect(fullKey.startsWith('123i_')).toBe(true);
    expect(prefix).toBe(fullKey.slice(0, 12));
    // Never equal to the full key -- the whole point is the hash isn't the secret itself.
    expect(hash).not.toBe(fullKey);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates a different key each call', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.fullKey).not.toBe(b.fullKey);
  });
});

describe('authenticateApiKey', () => {
  const orgIds: string[] = [];
  const userIds: string[] = [];
  afterAll(async () => {
    await Promise.all(orgIds.map((id) => cleanupOrg(id, userIds)));
  });

  async function seedKey(orgId: string, overrides: {
    revoked?: boolean;
    expiresAt?: string | null;
    allowedFormats?: string[] | null;
    allowedResources?: string[] | null;
  } = {}) {
    const { fullKey, prefix, hash } = generateApiKey();
    const { data: user } = await getServiceClient().auth.admin.createUser({
      email: `vitest-api-key-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      password: crypto.randomUUID(),
      email_confirm: true,
    });
    userIds.push(user!.user!.id);
    await getServiceClient().from('organization_api_keys').insert({
      organization_id: orgId,
      name: 'Test key',
      key_prefix: prefix,
      key_hash: hash,
      created_by: user!.user!.id,
      revoked_at: overrides.revoked ? new Date().toISOString() : null,
      expires_at: overrides.expiresAt ?? null,
      allowed_formats: overrides.allowedFormats ?? null,
      allowed_resources: overrides.allowedResources ?? null,
    });
    return fullKey;
  }

  it('rejects a missing Authorization header', async () => {
    const result = await authenticateApiKey(requestWithAuth());
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.status).toBe(401);
  });

  it('rejects a malformed Authorization header (not "Bearer <token>")', async () => {
    const result = await authenticateApiKey(requestWithAuth('Basic abc123'));
    expect('error' in result).toBe(true);
  });

  it('rejects an unknown key', async () => {
    const result = await authenticateApiKey(requestWithAuth('Bearer 123i_not-a-real-key'));
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.status).toBe(401);
  });

  it('accepts a valid key and resolves the right organization', async () => {
    const { orgId } = await createTestOrg();
    orgIds.push(orgId);
    const fullKey = await seedKey(orgId);

    const result = await authenticateApiKey(requestWithAuth(`Bearer ${fullKey}`));
    expect('organizationId' in result).toBe(true);
    if ('organizationId' in result) expect(result.organizationId).toBe(orgId);
  });

  it('rejects a revoked key', async () => {
    const { orgId } = await createTestOrg();
    orgIds.push(orgId);
    const fullKey = await seedKey(orgId, { revoked: true });

    const result = await authenticateApiKey(requestWithAuth(`Bearer ${fullKey}`));
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.status).toBe(401);
  });

  it('rejects an expired key, distinctly from a merely invalid/revoked one', async () => {
    const { orgId } = await createTestOrg();
    orgIds.push(orgId);
    const fullKey = await seedKey(orgId, { expiresAt: new Date(Date.now() - 86400000).toISOString() });

    const result = await authenticateApiKey(requestWithAuth(`Bearer ${fullKey}`));
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(401);
      const body = await result.error.clone().json();
      expect(body.error).toMatch(/expired/i);
    }
  });

  it('accepts a key with a future expiry', async () => {
    const { orgId } = await createTestOrg();
    orgIds.push(orgId);
    const fullKey = await seedKey(orgId, { expiresAt: new Date(Date.now() + 86400000).toISOString() });

    const result = await authenticateApiKey(requestWithAuth(`Bearer ${fullKey}`));
    expect('organizationId' in result).toBe(true);
  });

  it('surfaces a restricted key\'s allowedFormats/allowedResources', async () => {
    const { orgId } = await createTestOrg();
    orgIds.push(orgId);
    const fullKey = await seedKey(orgId, { allowedFormats: ['safe'], allowedResources: ['events'] });

    const result = await authenticateApiKey(requestWithAuth(`Bearer ${fullKey}`));
    expect('organizationId' in result).toBe(true);
    if ('organizationId' in result) {
      expect(result.allowedFormats).toEqual(['safe']);
      expect(result.allowedResources).toEqual(['events']);
    }
  });

  it('surfaces null allowedFormats/allowedResources for an unrestricted key', async () => {
    const { orgId } = await createTestOrg();
    orgIds.push(orgId);
    const fullKey = await seedKey(orgId);

    const result = await authenticateApiKey(requestWithAuth(`Bearer ${fullKey}`));
    expect('organizationId' in result).toBe(true);
    if ('organizationId' in result) {
      expect(result.allowedFormats).toBeNull();
      expect(result.allowedResources).toBeNull();
    }
  });
});
