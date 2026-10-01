// Regression test for a real shipped bug: GET /api/events/[id]/panels used
// to compute filled/is_full/available by counting only attendee_type
// ='attendee' registrations, while the real enforcement in
// POST /api/panel-registrations counts every confirmed (non-waitlisted)
// registration regardless of type. A panel full of promoted speakers/
// volunteer staff could show open spots that a real signup attempt would
// then reject — this test seeds exactly that mix and asserts the two code
// paths agree.
//
// Note: a successful POST here fires real (uncancellable) fire-and-forget
// side effects — a confirmation email attempt and automated-email
// scheduling. Neither is awaited or affects this test's assertions; the
// email attempt will fail harmlessly against a local DB with no
// MAILERSEND_API_KEY configured (logged, not thrown).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getPanels } from '@/app/api/events/[id]/panels/route';
import { POST as postPanelRegistration } from '@/app/api/panel-registrations/route';
import {
  createTestOrg, createTestEvent, createTestPanel, createTestRegistration,
  cleanupEvent, cleanupOrg,
} from '../helpers/fixtures';

describe('panel capacity: GET /panels agrees with POST /panel-registrations enforcement', () => {
  let orgId: string;
  let eventId: string;
  let panelId: string;

  beforeAll(async () => {
    ({ orgId } = await createTestOrg());
    ({ eventId } = await createTestEvent(orgId, { panels_enabled: true }));
    ({ panelId } = await createTestPanel(eventId, { capacity: 3, allow_waitlist: false }));

    // Mixed types, deliberately NOT all 'attendee' — this is exactly the
    // combination the old buggy GET route undercounted.
    await createTestRegistration({ eventId, panelId, attendeeType: 'attendee' });
    await createTestRegistration({ eventId, panelId, attendeeType: 'speaker' });
    await createTestRegistration({ eventId, panelId, attendeeType: 'volunteer' });
  });

  afterAll(async () => {
    await cleanupEvent(eventId);
    await cleanupOrg(orgId);
  });

  it('GET reports the panel as full (3/3) counting all three types, not just attendees', async () => {
    const res = await getPanels(
      new NextRequest(`http://localhost/api/events/${eventId}/panels`),
      { params: Promise.resolve({ id: eventId }) }
    );
    const panels = await res.json();
    const panel = panels.find((p: { id: string }) => p.id === panelId);

    expect(panel.filled).toBe(3);
    expect(panel.available).toBe(0);
    expect(panel.is_full).toBe(true);
  });

  it('a real signup attempt is rejected (409) exactly because the panel is full, matching GET', async () => {
    const res = await postPanelRegistration(new NextRequest('http://localhost/api/panel-registrations', {
      method: 'POST',
      body: JSON.stringify({ panel_id: panelId, name: 'New Attendee', email: 'new-attendee@example.com' }),
    }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/is full/);
  });

  it('raising capacity to 4 makes GET report one spot open, and a real signup then succeeds', async () => {
    const { getServiceClient } = await import('../helpers/client');
    await getServiceClient().from('panels').update({ capacity: 4 }).eq('id', panelId);

    const getRes = await getPanels(
      new NextRequest(`http://localhost/api/events/${eventId}/panels`),
      { params: Promise.resolve({ id: eventId }) }
    );
    const panels = await getRes.json();
    const panel = panels.find((p: { id: string }) => p.id === panelId);
    expect(panel.available).toBe(1);
    expect(panel.is_full).toBe(false);

    const postRes = await postPanelRegistration(new NextRequest('http://localhost/api/panel-registrations', {
      method: 'POST',
      body: JSON.stringify({ panel_id: panelId, name: 'Fits Now', email: 'fits-now@example.com' }),
    }));
    expect(postRes.status).toBe(201);
  });
});
