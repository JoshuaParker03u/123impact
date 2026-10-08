// Regression test for a real shipped bug: the `panels` table has RLS
// enabled with ZERO client-readable policies (service-role-only by design,
// documented in its own migration comment, same pattern as
// event_speaker_invites). A direct anon-key query against it always
// silently returns empty regardless of real data — this caused the events
// list page's Panels dropdown to always show 0, which a service-role-only
// test never would have caught, since service role bypasses RLS entirely.
//
// This test uses a REAL signed-in, non-service-role session on purpose —
// using the service client here would defeat the entire point (see the
// last test below, which demonstrates exactly that).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getPanels } from '@/app/api/events/[id]/panels/route';
import { getServiceClient, getAnonClient } from './helpers/client';
import {
  createTestOrg, createTestAdminUser, signInAs, createTestEvent, createTestPanel,
  cleanupEvent, cleanupOrg,
} from './helpers/fixtures';

describe('RLS boundary: panels is service-role-only', () => {
  let orgId: string;
  let eventId: string;
  let panelId: string;
  let userId: string;
  let email: string;
  let password: string;

  beforeAll(async () => {
    ({ orgId } = await createTestOrg());
    ({ eventId } = await createTestEvent(orgId, { panels_enabled: true }));
    ({ panelId } = await createTestPanel(eventId));
    ({ userId, email, password } = await createTestAdminUser(orgId, 'admin'));
    await signInAs(email, password);
  });

  afterAll(async () => {
    await cleanupEvent(eventId);
    await cleanupOrg(orgId, [userId]);
  });

  it('a real signed-in org admin querying panels directly via the anon client gets nothing back', async () => {
    const { data, error } = await getAnonClient().from('panels').select('*').eq('id', panelId);
    // No RLS policy exists to deny-with-error — it just matches zero rows.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('the real application route (service-role-fronted) still returns the panel correctly', async () => {
    const res = await getPanels(
      new NextRequest(`http://localhost/api/events/${eventId}/panels`),
      { params: Promise.resolve({ id: eventId }) }
    );
    const panels = await res.json();
    expect(panels.some((p: { id: string }) => p.id === panelId)).toBe(true);
  });

  it('demonstrates why this test must use the anon client: the service client would wrongly "pass"', async () => {
    // Service role bypasses RLS entirely — if this test used getServiceClient()
    // instead of getAnonClient() above, it would see the row and the bug
    // would never have been caught. This is why "verified with a
    // service-role script" was not sufficient for this bug originally.
    const { data } = await getServiceClient().from('panels').select('*').eq('id', panelId);
    expect(data).toHaveLength(1);
  });
});
