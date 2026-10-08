// Regression test for a recurring bug class that has independently hit this
// project many times (volunteer messaging, the admin volunteers page, this
// exact analytics route, RLS policies): event_id is populated on EVERY
// volunteer_registrations row regardless of anchor (shift_id / panel_id /
// neither), but code that resolves "registrations for this event" by going
// event -> shifts -> shift_id IN (...) instead of querying event_id
// directly silently drops every panel and shiftless registration.
//
// This seeds one event with all three anchor types and asserts a real
// "list registrations for event" code path (fetchAnalyticsData, already
// fixed to query by event_id) returns all three — a template any other
// such code path can be checked against going forward.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fetchAnalyticsData } from '@/app/api/events/[id]/analytics/route';
import { getServiceClient } from './helpers/client';
import {
  createTestOrg, createTestEvent, createTestShift, createTestPanel, createTestRegistration,
  cleanupEvent, cleanupOrg,
} from './helpers/fixtures';

describe('shift_id-first-join bug pattern: event_id-based queries must see every anchor type', () => {
  let orgId: string;
  let eventId: string;

  beforeAll(async () => {
    ({ orgId } = await createTestOrg());
    ({ eventId } = await createTestEvent(orgId, { panels_enabled: true, attendee_enabled: true, is_shiftless: true }));

    const { shiftId } = await createTestShift(eventId);
    const { panelId } = await createTestPanel(eventId);

    // One of each anchor type — shift-anchored, panel-anchored, and
    // unanchored/shiftless. A shift_id-first join only ever sees the first.
    await createTestRegistration({ eventId, shiftId, attendeeType: 'volunteer' });
    await createTestRegistration({ eventId, panelId, attendeeType: 'attendee' });
    await createTestRegistration({ eventId, attendeeType: 'volunteer' }); // shiftless
  });

  afterAll(async () => {
    await cleanupEvent(eventId);
    await cleanupOrg(orgId);
  });

  it('fetchAnalyticsData sees all three registrations, not just the shift-anchored one', async () => {
    const data = await fetchAnalyticsData(getServiceClient(), eventId);

    expect(data).not.toBeNull();
    expect(data!.total_registrations).toBe(3);
    expect(data!.registrations).toHaveLength(3);
  });

  it('documents the correct pattern directly: an event_id query sees all three; a shift_id-first join would not', async () => {
    const service = getServiceClient();

    const { data: byEventId } = await service
      .from('volunteer_registrations')
      .select('id')
      .eq('event_id', eventId);
    expect(byEventId).toHaveLength(3);

    const { data: shifts } = await service.from('shifts').select('id').eq('event_id', eventId);
    const shiftIds = (shifts ?? []).map((s) => s.id);
    const { data: byShiftIdJoin } = await service
      .from('volunteer_registrations')
      .select('id')
      .in('shift_id', shiftIds);
    // This is the buggy pattern — only the one shift-anchored row.
    expect(byShiftIdJoin).toHaveLength(1);
  });
});
