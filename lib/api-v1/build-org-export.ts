// Builds the response for GET /api/v1/organizations/me (an admin-level,
// read-only, Bearer-API-key-gated export of essentially everything an org
// owns) -- kept separate from the route itself so the shaping logic is
// testable without mocking auth, same precedent as
// lib/public-feed/build-feed-data.ts.
//
// A handful of fields are excluded in every format, regardless of
// `include` -- these are secrets, not data, and none of this feature's
// format options are meant to expose them:
//   - organizations.stripe_customer_id / stripe_subscription_id
//   - platform_connections.access_token / refresh_token / token_expires_at
//   - event_admin_assignments.token, event_speaker_invites.token (invite
//     links that grant access if known -- same class of secret as an API
//     key, not public-feed-eligible data)
//   - org_custom_domains.verification_token
//   - events.discord_showtime_webhook_url, panels.discord_showtime_webhook_url
//     (posting into that Discord channel requires nothing but this URL --
//     same bearer-capability-secret class as the rest of this list)
import { createClient } from '@supabase/supabase-js';
import { buildOrgFeedData } from '@/lib/public-feed/build-feed-data';
import { buildEventsJson } from '@/lib/public-feed/to-json';

function buildServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export type ExportFormat = 'full' | 'safe' | 'sparse' | 'public';

export const EXPORT_RESOURCE_KEYS = [
  'organization',
  'events',
  'registrations',
  'admins',
  'speaker_invites',
  'custom_domains',
  'platform_connections',
] as const;
export type ExportResourceKey = typeof EXPORT_RESOURCE_KEYS[number];

const PII_FIELDS = ['email', 'phone', 'discord_user_id', 'discord_username'] as const;

function stripPII(row: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...row };
  for (const field of PII_FIELDS) delete copy[field];
  return copy;
}

function sparseFields(row: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) if (field in row) out[field] = row[field];
  return out;
}

// Registrations carry PII regardless of format -- safe mode strips it;
// sparse mode both strips PII and trims to a small summary shape (sparse
// implies safe, a client asking for "just what exists" shouldn't get full
// contact details either).
function shapeRegistration(row: Record<string, unknown>, format: ExportFormat): Record<string, unknown> {
  if (format === 'sparse') {
    return sparseFields(stripPII(row), ['id', 'name', 'attendee_type', 'event_id', 'shift_id', 'panel_id', 'is_waitlisted']);
  }
  return format === 'safe' ? stripPII(row) : row;
}

function stripHardExcludedEventFields(row: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...row };
  delete copy.discord_showtime_webhook_url;
  if (Array.isArray(copy.panels)) {
    copy.panels = copy.panels.map((p: Record<string, unknown>) => {
      const panelCopy = { ...p };
      delete panelCopy.discord_showtime_webhook_url;
      return panelCopy;
    });
  }
  return copy;
}

function shapeEvent(row: Record<string, unknown>, format: ExportFormat): Record<string, unknown> {
  const cleaned = stripHardExcludedEventFields(row);
  if (format === 'sparse') {
    return sparseFields(cleaned, ['id', 'event_id', 'title', 'date', 'end_date', 'status']);
  }
  return cleaned;
}

async function fetchOrgEventIds(service: ReturnType<typeof buildServiceClient>, organizationId: string): Promise<string[]> {
  const { data } = await service.from('events').select('id').eq('organization_id', organizationId);
  return (data ?? []).map((e) => (e as { id: string }).id);
}

export async function buildOrgExport(
  organizationId: string,
  { format, include }: { format: ExportFormat; include: ExportResourceKey[] }
): Promise<Record<string, unknown>> {
  if (format === 'public') {
    const data = await buildOrgFeedData(organizationId);
    return data ? (buildEventsJson(data) as unknown as Record<string, unknown>) : {};
  }

  const service = buildServiceClient();
  const result: Record<string, unknown> = {};

  if (include.includes('organization')) {
    const { data } = await service
      .from('organizations')
      .select('id, name, description, contact_email, contact_phone, website, logo_url, status, timezone, plan, public_id, created_at, updated_at')
      .eq('id', organizationId)
      .maybeSingle();
    result.organization = data ?? null;
  }

  let eventIds: string[] | null = null;
  const getEventIds = async () => (eventIds ??= await fetchOrgEventIds(service, organizationId));

  if (include.includes('events')) {
    const { data } = await service
      .from('events')
      .select('*, event_day_hours(*), shifts(*), panels(*, panel_assignments(*))')
      .eq('organization_id', organizationId)
      .order('date', { ascending: true });
    result.events = (data ?? []).map((row) => shapeEvent(row, format));
  }

  if (include.includes('registrations')) {
    const ids = await getEventIds();
    const { data } = ids.length
      ? await service.from('volunteer_registrations').select('*').in('event_id', ids)
      : { data: [] as Record<string, unknown>[] };
    result.registrations = (data ?? []).map((row) => shapeRegistration(row, format));
  }

  if (include.includes('admins')) {
    const ids = await getEventIds();
    const [{ data: orgAdmins }, { data: eventAdmins }] = await Promise.all([
      service.from('organization_admins').select('id, user_id, role, joined_at, created_at').eq('organization_id', organizationId),
      ids.length
        ? service.from('event_admin_assignments').select('id, event_id, email, status, co_sponsor, created_at, updated_at').in('event_id', ids)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ]);
    result.admins = {
      organization_admins: orgAdmins ?? [],
      event_admin_assignments: eventAdmins ?? [],
    };
  }

  if (include.includes('speaker_invites')) {
    const ids = await getEventIds();
    const { data } = ids.length
      ? await service
          .from('event_speaker_invites')
          .select('id, event_id, email, status, topic, session_time, registration_id, created_at, updated_at, expires_at')
          .in('event_id', ids)
      : { data: [] as Record<string, unknown>[] };
    result.speaker_invites = data ?? [];
  }

  if (include.includes('custom_domains')) {
    const { data } = await service
      .from('org_custom_domains')
      .select('id, subdomain, status, header_links, primary_color, secondary_color, banner_image_url, dns_admin_email, ssl_expires_at, created_at, updated_at')
      .eq('organization_id', organizationId);
    result.custom_domains = data ?? [];
  }

  if (include.includes('platform_connections')) {
    const { data } = await service
      .from('platform_connections')
      .select('id, platform, external_org_id, external_org_name, channel_id, announcement_channel_id, sync_new_events, connected_at')
      .eq('organization_id', organizationId);
    result.platform_connections = data ?? [];
  }

  return result;
}
