// Regression coverage for the public feed's org identifier: it must be a
// one-way hash (not the raw org id), generated lazily on first use rather
// than requiring a backfill, deterministic (idempotent across repeat
// calls), and resolvable back to the real org id only via a stored lookup.
import { describe, it, expect, afterAll } from 'vitest';
import { getOrEnsurePublicId, resolveOrgIdFromPublicId } from '@/lib/org-public-id';
import { createTestOrg, cleanupOrg } from './helpers/fixtures';
import { getServiceClient } from './helpers/client';

describe('getOrEnsurePublicId / resolveOrgIdFromPublicId', () => {
  const orgIds: string[] = [];
  afterAll(async () => {
    await Promise.all(orgIds.map((id) => cleanupOrg(id)));
  });

  it('generates and persists a public_id on first call', async () => {
    const { orgId } = await createTestOrg();
    orgIds.push(orgId);

    const { data: before } = await getServiceClient().from('organizations').select('public_id').eq('id', orgId).single();
    expect(before?.public_id).toBeNull();

    const publicId = await getOrEnsurePublicId(orgId);
    expect(publicId).toBeTruthy();
    expect(publicId).not.toBe(orgId);

    const { data: after } = await getServiceClient().from('organizations').select('public_id').eq('id', orgId).single();
    expect(after?.public_id).toBe(publicId);
  });

  it('is idempotent -- repeat calls return the same value without recomputing', async () => {
    const { orgId } = await createTestOrg();
    orgIds.push(orgId);

    const first = await getOrEnsurePublicId(orgId);
    const second = await getOrEnsurePublicId(orgId);
    expect(second).toBe(first);
  });

  it('resolves a public_id back to the real org id', async () => {
    const { orgId } = await createTestOrg();
    orgIds.push(orgId);

    const publicId = await getOrEnsurePublicId(orgId);
    const resolved = await resolveOrgIdFromPublicId(publicId);
    expect(resolved).toBe(orgId);
  });

  it('returns null for an unknown public_id', async () => {
    const resolved = await resolveOrgIdFromPublicId('not-a-real-public-id');
    expect(resolved).toBeNull();
  });
});
