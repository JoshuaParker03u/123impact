// Regression coverage for the Discord bot's reworked /signup data capture:
// email is now optional when a discord_user_id is present (the bot asks for
// a preferred name + pronouns, never an email), for both the panel-RSVP and
// shift-batch registration routes. Proves the routes still enforce "name
// and (email or a Discord account)" rather than silently accepting neither,
// that pronouns are actually persisted, and that a repeat signup from the
// same Discord account is detected via discord_user_id (not just email,
// which doesn't exist for these rows).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as postPanelRegistration } from '@/app/api/panel-registrations/route';
import { POST as postShiftBatch } from '@/app/api/volunteer-registrations/batch/route';
import {
  createTestOrg, createTestEvent, createTestPanel, createTestShift, cleanupEvent, cleanupOrg,
} from '../helpers/fixtures';
import { getServiceClient } from '../helpers/client';

function postJson(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Discord bot signup: no email, discord_user_id instead', () => {
  let orgId: string;
  let eventId: string;
  let panelId: string;
  let shiftId: string;

  beforeAll(async () => {
    ({ orgId } = await createTestOrg());
    ({ eventId } = await createTestEvent(orgId, { panels_enabled: true }));
    ({ panelId } = await createTestPanel(eventId, { capacity: 5, allow_waitlist: false }));
    ({ shiftId } = await createTestShift(eventId, { capacity: 5 }));
  });

  afterAll(async () => {
    await cleanupEvent(eventId);
    await cleanupOrg(orgId);
  });

  it('rejects a panel registration with neither email nor a Discord account', async () => {
    const res = await postPanelRegistration(postJson('http://localhost/api/panel-registrations', {
      panel_id: panelId, name: 'No Identity',
    }));
    expect(res.status).toBe(400);
  });

  it('accepts a panel registration with only a Discord account, storing pronouns and a null email', async () => {
    const discordUserId = 'discord-panel-' + Date.now();
    const res = await postPanelRegistration(postJson('http://localhost/api/panel-registrations', {
      panel_id: panelId, name: 'Jamie', pronouns: 'they/them', discord_user_id: discordUserId,
    }));
    expect(res.status).toBe(201);

    const { data } = await getServiceClient()
      .from('volunteer_registrations')
      .select('email, pronouns, discord_user_id, attendee_type')
      .eq('panel_id', panelId)
      .eq('discord_user_id', discordUserId)
      .single();
    expect(data).toEqual({ email: null, pronouns: 'they/them', discord_user_id: discordUserId, attendee_type: 'attendee' });
  });

  it('detects a repeat signup from the same Discord account for the same panel (no email to match on)', async () => {
    const discordUserId = 'discord-panel-repeat-' + Date.now();
    const first = await postPanelRegistration(postJson('http://localhost/api/panel-registrations', {
      panel_id: panelId, name: 'Riley', discord_user_id: discordUserId,
    }));
    expect(first.status).toBe(201);

    const second = await postPanelRegistration(postJson('http://localhost/api/panel-registrations', {
      panel_id: panelId, name: 'Riley', discord_user_id: discordUserId,
    }));
    const secondBody = await second.json();
    expect(second.status).toBe(200);
    expect(secondBody.alreadyRegistered).toBe(true);
  });

  it('accepts a shift registration with only a Discord account, storing pronouns and a null email', async () => {
    const discordUserId = 'discord-shift-' + Date.now();
    const res = await postShiftBatch(postJson('http://localhost/api/volunteer-registrations/batch', {
      name: 'Sam', pronouns: 'she/her', shift_ids: [shiftId], discord_user_id: discordUserId,
    }));
    expect(res.status).toBe(201);

    const { data } = await getServiceClient()
      .from('volunteer_registrations')
      .select('email, pronouns, discord_user_id')
      .eq('shift_id', shiftId)
      .eq('discord_user_id', discordUserId)
      .single();
    expect(data).toEqual({ email: null, pronouns: 'she/her', discord_user_id: discordUserId });
  });

  it('rejects a shift registration with neither email nor a Discord account', async () => {
    const res = await postShiftBatch(postJson('http://localhost/api/volunteer-registrations/batch', {
      name: 'No Identity', shift_ids: [shiftId],
    }));
    expect(res.status).toBe(400);
  });
});
