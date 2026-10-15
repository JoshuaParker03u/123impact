// Regression coverage for the upsert-then-delete-stale pattern behind both
// EventModal's direct-Supabase save path and the panel API routes. The
// property that actually matters and isn't obvious from reading the code
// once: an upsert that only mentions lead_minutes/message must NEVER touch
// an already-fired reminder's sent_at, or editing an unrelated field (or
// just re-saving the form) would silently cause a duplicate Discord post.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { saveShowtimeReminders, findDuplicateLeadMinutes } from '@/lib/discord/save-showtime-reminders';
import { createTestOrg, createTestEvent, cleanupEvent, cleanupOrg } from '../helpers/fixtures';
import { getServiceClient } from '../helpers/client';

describe('findDuplicateLeadMinutes', () => {
  it('returns the duplicated value when one exists', () => {
    expect(findDuplicateLeadMinutes([{ lead_minutes: 60, message: null }, { lead_minutes: 60, message: 'x' }])).toBe(60);
  });

  it('returns null when all lead times are unique', () => {
    expect(findDuplicateLeadMinutes([{ lead_minutes: 60, message: null }, { lead_minutes: 30, message: null }])).toBeNull();
  });
});

describe('saveShowtimeReminders', () => {
  let orgId: string;
  let eventId: string;

  beforeAll(async () => {
    ({ orgId } = await createTestOrg());
    ({ eventId } = await createTestEvent(orgId));
  });

  afterAll(async () => {
    await cleanupEvent(eventId);
    await cleanupOrg(orgId);
  });

  it('refuses to save duplicate lead times without writing anything', async () => {
    const result = await saveShowtimeReminders(getServiceClient(), 'event_id', eventId, [
      { lead_minutes: 60, message: null },
      { lead_minutes: 60, message: 'different message' },
    ]);
    expect(result.error).toMatch(/60 minute/);

    const { data } = await getServiceClient().from('discord_showtime_reminders').select('id').eq('event_id', eventId);
    expect(data).toEqual([]);
  });

  it('creates rows for a fresh set of reminders', async () => {
    const result = await saveShowtimeReminders(getServiceClient(), 'event_id', eventId, [
      { lead_minutes: 60, message: null },
      { lead_minutes: 30, message: 'Halfway!' },
      { lead_minutes: 0, message: null },
    ]);
    expect(result.error).toBeNull();

    const { data } = await getServiceClient()
      .from('discord_showtime_reminders')
      .select('lead_minutes, message, sent_at')
      .eq('event_id', eventId)
      .order('lead_minutes', { ascending: false });
    expect(data).toEqual([
      { lead_minutes: 60, message: null, sent_at: null },
      { lead_minutes: 30, message: 'Halfway!', sent_at: null },
      { lead_minutes: 0, message: null, sent_at: null },
    ]);
  });

  it('preserves an already-fired reminder\'s sent_at when only its message changes', async () => {
    const service = getServiceClient();
    await service.from('discord_showtime_reminders').update({ sent_at: new Date().toISOString() })
      .eq('event_id', eventId).eq('lead_minutes', 60);

    const result = await saveShowtimeReminders(service, 'event_id', eventId, [
      { lead_minutes: 60, message: 'Updated text, already fired' },
      { lead_minutes: 30, message: 'Halfway!' },
      { lead_minutes: 0, message: null },
    ]);
    expect(result.error).toBeNull();

    const { data } = await service.from('discord_showtime_reminders').select('message, sent_at').eq('event_id', eventId).eq('lead_minutes', 60).single();
    expect(data?.message).toBe('Updated text, already fired');
    expect(data?.sent_at).not.toBeNull();
  });

  it('deletes a reminder whose lead time was removed from the list', async () => {
    const service = getServiceClient();
    const result = await saveShowtimeReminders(service, 'event_id', eventId, [
      { lead_minutes: 60, message: 'Updated text, already fired' },
      { lead_minutes: 0, message: null },
    ]);
    expect(result.error).toBeNull();

    const { data } = await service.from('discord_showtime_reminders').select('lead_minutes').eq('event_id', eventId).order('lead_minutes');
    expect(data).toEqual([{ lead_minutes: 0 }, { lead_minutes: 60 }]);
  });

  it('deletes every reminder when the list is emptied', async () => {
    const service = getServiceClient();
    const result = await saveShowtimeReminders(service, 'event_id', eventId, []);
    expect(result.error).toBeNull();

    const { data } = await service.from('discord_showtime_reminders').select('id').eq('event_id', eventId);
    expect(data).toEqual([]);
  });
});
