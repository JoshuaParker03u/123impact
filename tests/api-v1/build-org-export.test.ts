// Regression coverage for GET /api/v1/organizations/me's data shaping:
// safe/sparse must actually redact what they promise to, include= must
// actually omit what it's not asked for, and format=public must match the
// same feed builder the no-auth public feed itself uses (never a
// second, drifting implementation of the same shape).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildOrgExport, parseFormatParam, parseIncludeParam, EXPORT_RESOURCE_KEYS } from '@/lib/api-v1/build-org-export';
import { buildOrgFeedData } from '@/lib/public-feed/build-feed-data';
import { buildEventsJson } from '@/lib/public-feed/to-json';
import {
  createTestOrg, createTestEvent, createTestShift, createTestPanel, createTestRegistration,
  cleanupEvent, cleanupOrg,
} from '../helpers/fixtures';

describe('parseFormatParam / parseIncludeParam', () => {
  it('defaults format to full for anything unrecognized', () => {
    expect(parseFormatParam(null)).toBe('full');
    expect(parseFormatParam('bogus')).toBe('full');
    expect(parseFormatParam('safe')).toBe('safe');
    expect(parseFormatParam('sparse')).toBe('sparse');
    expect(parseFormatParam('public')).toBe('public');
  });

  it('defaults include to every resource key when omitted', () => {
    expect(parseIncludeParam(null)).toEqual([...EXPORT_RESOURCE_KEYS]);
  });

  it('filters include to only recognized keys, ignoring unknown ones', () => {
    expect(parseIncludeParam('events,bogus,registrations')).toEqual(['events', 'registrations']);
  });
});

describe('buildOrgExport', () => {
  let orgId: string;
  let eventId: string;

  beforeAll(async () => {
    ({ orgId } = await createTestOrg());
    ({ eventId } = await createTestEvent(orgId));
    const { shiftId } = await createTestShift(eventId);
    await createTestRegistration({ eventId, shiftId, attendeeType: 'volunteer' });
  });

  afterAll(async () => {
    await cleanupEvent(eventId);
    await cleanupOrg(orgId);
  });

  it('format=full includes registrant PII', async () => {
    const result = await buildOrgExport(orgId, { format: 'full', include: ['registrations'] });
    const regs = result.registrations as Record<string, unknown>[];
    expect(regs).toHaveLength(1);
    expect(regs[0].email).toBeTruthy();
  });

  it('format=safe strips PII that full includes', async () => {
    const result = await buildOrgExport(orgId, { format: 'safe', include: ['registrations'] });
    const regs = result.registrations as Record<string, unknown>[];
    expect(regs).toHaveLength(1);
    expect(regs[0].email).toBeUndefined();
    expect(regs[0].phone).toBeUndefined();
    // Non-PII fields are untouched.
    expect(regs[0].attendee_type).toBe('volunteer');
  });

  it('format=sparse trims events to a summary shape with no nested shifts', async () => {
    const result = await buildOrgExport(orgId, { format: 'sparse', include: ['events'] });
    const events = result.events as Record<string, unknown>[];
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(eventId);
    expect(events[0].shifts).toBeUndefined();
    expect(events[0].location).toBeUndefined();
  });

  it('never includes a Discord showtime webhook URL, even in format=full -- it\'s a bearer-capability secret, not data', async () => {
    const { eventId: webhookEventId } = await createTestEvent(orgId, { discord_showtime_webhook_url: 'https://discord.com/api/webhooks/secret-event' });
    await createTestPanel(webhookEventId, { discord_showtime_webhook_url: 'https://discord.com/api/webhooks/secret-panel' });

    const result = await buildOrgExport(orgId, { format: 'full', include: ['events'] });
    const events = result.events as Record<string, unknown>[];
    const webhookEvent = events.find((e) => e.id === webhookEventId)!;

    expect(webhookEvent.discord_showtime_webhook_url).toBeUndefined();
    const panels = webhookEvent.panels as Record<string, unknown>[];
    expect(panels[0].discord_showtime_webhook_url).toBeUndefined();

    await cleanupEvent(webhookEventId);
  });

  it('include= omits every key not asked for', async () => {
    const result = await buildOrgExport(orgId, { format: 'full', include: ['events'] });
    expect(Object.keys(result)).toEqual(['events']);
  });

  it('format=public matches buildOrgFeedData/buildEventsJson directly, and ignores include', async () => {
    const expectedJson = buildEventsJson((await buildOrgFeedData(orgId))!) as Record<string, unknown>;
    const result = await buildOrgExport(orgId, { format: 'public', include: ['registrations'] });

    // `generated` is a fresh timestamp on every call -- compare everything else.
    expect(typeof result.generated).toBe('string');
    expect({ ...result, generated: null }).toEqual({ ...expectedJson, generated: null });
  });
});
