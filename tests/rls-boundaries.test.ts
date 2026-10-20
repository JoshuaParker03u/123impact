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

async function seedShowtimeReminder(eventId: string): Promise<{ reminderId: string }> {
  const { data, error } = await getServiceClient()
    .from('discord_showtime_reminders')
    .insert({ event_id: eventId, lead_minutes: 15 })
    .select('id')
    .single();
  if (error) throw error;
  return { reminderId: data.id };
}

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

// Regression test for a different shipped bug than the one above: the
// opposite failure mode. discord_showtime_reminders shipped with RLS not
// enabled AT ALL (not "enabled with zero policies" like panels) -- a
// public-schema table with RLS off is unrestricted for every
// anon/authenticated client regardless of what the app's own routes check,
// flagged CRITICAL by Supabase's own security advisor. Fixed by enabling
// RLS with an org-admin-scoped policy (not a blanket service-role-only
// lockdown, since EventModal/PanelModal write here directly with the
// browser/anon-key client -- see the migration's own comment). This test
// proves both halves: the legitimate admin's access still works, AND a
// different org's admin is now actually denied (which a service-role-only
// test could never catch, same rationale as the describe block above).
describe('RLS boundary: discord_showtime_reminders is org-admin-scoped, not wide open', () => {
  let ownOrgId: string;
  let ownEventId: string;
  let reminderId: string;
  let ownAdmin: { userId: string; email: string; password: string };
  let otherOrgId: string;
  let otherAdmin: { userId: string; email: string; password: string };

  beforeAll(async () => {
    ({ orgId: ownOrgId } = await createTestOrg());
    ({ eventId: ownEventId } = await createTestEvent(ownOrgId));
    ({ reminderId } = await seedShowtimeReminder(ownEventId));
    ownAdmin = await createTestAdminUser(ownOrgId, 'admin');

    ({ orgId: otherOrgId } = await createTestOrg());
    otherAdmin = await createTestAdminUser(otherOrgId, 'admin');
  });

  afterAll(async () => {
    await cleanupEvent(ownEventId);
    await cleanupOrg(ownOrgId, [ownAdmin.userId]);
    await cleanupOrg(otherOrgId, [otherAdmin.userId]);
  });

  it('the owning org\'s admin can read the reminder via the anon client', async () => {
    await signInAs(ownAdmin.email, ownAdmin.password);

    const { data, error } = await getAnonClient().from('discord_showtime_reminders').select('*').eq('id', reminderId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('a different org\'s admin gets nothing back for the same row via the anon client', async () => {
    await signInAs(otherAdmin.email, otherAdmin.password);

    const { data, error } = await getAnonClient().from('discord_showtime_reminders').select('*').eq('id', reminderId);
    // No RLS policy matches this row for this user -- not an error, just zero rows.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('demonstrates why this test must use the anon client: the service client would wrongly "pass" for anyone', async () => {
    const { data } = await getServiceClient().from('discord_showtime_reminders').select('*').eq('id', reminderId);
    expect(data).toHaveLength(1);
  });
});
