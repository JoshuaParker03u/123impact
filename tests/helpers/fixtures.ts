import { randomUUID } from 'node:crypto';
import { getServiceClient } from './client';

// Every fixture gets a unique prefix so tests never collide with each other
// even without a DB reset between runs (see vitest.config.ts's
// fileParallelism note). Each test is responsible for calling cleanupEvent/
// cleanupOrg in afterEach/afterAll — FK cascades handle the rest (every
// anchor FK on volunteer_registrations, and panels.event_id/shifts.event_id,
// are ON DELETE CASCADE).
function tag(label: string): string {
  return `vitest-${label}-${randomUUID().slice(0, 8)}`;
}

export async function createTestOrg(): Promise<{ orgId: string }> {
  const service = getServiceClient();
  const { data, error } = await service
    .from('organizations')
    .insert({ name: tag('org') })
    .select('id')
    .single();
  if (error) throw error;
  return { orgId: data.id };
}

export async function createTestAdminUser(
  orgId: string,
  role: 'owner' | 'admin' = 'admin'
): Promise<{ userId: string; email: string; password: string }> {
  const service = getServiceClient();
  const email = `${tag('user')}@example.com`;
  const password = randomUUID();

  const { data: userRes, error: userError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userError || !userRes.user) throw userError ?? new Error('createUser returned no user');

  const { error: adminError } = await service
    .from('organization_admins')
    .insert({ organization_id: orgId, user_id: userRes.user.id, role });
  if (adminError) throw adminError;

  return { userId: userRes.user.id, email, password };
}

// Only needed by tests/rls-boundaries.test.ts, which must use a real
// anon-key session rather than the service client to actually prove the RLS
// boundary.
export async function signInAs(email: string, password: string): Promise<{ accessToken: string }> {
  const { getAnonClient } = await import('./client');
  const { data, error } = await getAnonClient().auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error('signInWithPassword returned no session');
  return { accessToken: data.session.access_token };
}

export interface TestEventOverrides {
  is_shiftless?: boolean;
  shiftless_capacity?: number | null;
  attendee_enabled?: boolean;
  attendee_capacity?: number | null;
  speaker_enabled?: boolean;
  panels_enabled?: boolean;
}

export async function createTestEvent(orgId: string, overrides: TestEventOverrides = {}): Promise<{ eventId: string }> {
  const service = getServiceClient();
  const slug = tag('event');
  const { data, error } = await service
    .from('events')
    .insert({
      event_id: slug,
      organization_id: orgId,
      title: slug,
      date: '2026-12-01',
      time: '09:00',
      location: 'Test Location',
      status: 'active',
      event_format: 'in_person',
      is_shiftless: false,
      attendee_enabled: false,
      speaker_enabled: false,
      panels_enabled: false,
      ...overrides,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { eventId: data.id };
}

export async function createTestShift(
  eventId: string,
  overrides: { capacity?: number } = {}
): Promise<{ shiftId: string }> {
  const service = getServiceClient();
  const { data, error } = await service
    .from('shifts')
    .insert({
      event_id: eventId,
      // Human-readable per-event shift number -- NOT NULL, unique per
      // event_id. Tests never display it, so a random int avoids collisions
      // within a single event without needing a real per-event counter.
      shift_id: Math.floor(Math.random() * 1_000_000_000),
      name: tag('shift'),
      start_time: '09:00',
      end_time: '12:00',
      capacity: overrides.capacity ?? 10,
      filled: 0,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { shiftId: data.id };
}

export async function createTestPanel(
  eventId: string,
  overrides: { capacity?: number; allow_waitlist?: boolean } = {}
): Promise<{ panelId: string }> {
  const service = getServiceClient();
  const { data, error } = await service
    .from('panels')
    .insert({
      event_id: eventId,
      name: tag('panel'),
      start_time: '13:00',
      end_time: '14:00',
      capacity: overrides.capacity ?? 3,
      allow_waitlist: overrides.allow_waitlist ?? false,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { panelId: data.id };
}

export interface TestRegistrationInput {
  eventId: string;
  shiftId?: string;
  panelId?: string;
  attendeeType: 'volunteer' | 'attendee' | 'speaker';
  isWaitlisted?: boolean;
}

export async function createTestRegistration(input: TestRegistrationInput): Promise<{ registrationId: string }> {
  const service = getServiceClient();
  const { data, error } = await service
    .from('volunteer_registrations')
    .insert({
      event_id: input.eventId,
      shift_id: input.shiftId ?? null,
      panel_id: input.panelId ?? null,
      attendee_type: input.attendeeType,
      is_waitlisted: input.isWaitlisted ?? false,
      name: tag('reg'),
      email: `${tag('reg')}@example.com`,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { registrationId: data.id };
}

// Deleting the events row is sufficient — shifts.event_id, panels.event_id,
// and volunteer_registrations' three anchor FKs are all ON DELETE CASCADE.
export async function cleanupEvent(eventId: string): Promise<void> {
  await getServiceClient().from('events').delete().eq('id', eventId);
}

export async function cleanupOrg(orgId: string, userIds: string[] = []): Promise<void> {
  const service = getServiceClient();
  await service.from('organizations').delete().eq('id', orgId);
  await Promise.all(userIds.map((id) => service.auth.admin.deleteUser(id).catch(() => {})));
}
