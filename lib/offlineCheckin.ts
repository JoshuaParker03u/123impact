'use client';

// Client-side cache + retry queue for the personal check-in page
// (app/events/[eventId]/r/[registrationId]/page.tsx), so staff can still see
// registrant info and check people in when connectivity drops mid-event.
//
// Safe to retry blindly: check_ins has a unique index on registration_id, so
// a duplicate POST to /api/checkin/[registrationId] just returns
// already_checked_in instead of erroring — there's no risk of double-booking
// a check-in by queuing and later retrying the same request.

export type CheckInData = {
  registration_id: string;
  registrant_name: string;
  registrant_email?: string;
  registered_at?: string;
  event: { id: string; title: string; event_id: string; date: string };
  shift: { id: string; name: string; start_time: string; end_time: string };
  checked_in: boolean;
  checked_in_at: string | null;
  checked_in_by?: string | null;
  is_staff_view: boolean;
};

type CachedEntry = {
  data: CheckInData;
  cachedAt: string;
  // true = checked in while offline, not yet confirmed by the server
  pendingSync: boolean;
};

const STORAGE_KEY = '123impact_checkin_cache';

function readCache(): Record<string, CachedEntry> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, CachedEntry>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Storage full or unavailable (private browsing) — degrade to no cache.
  }
}

export function getCachedCheckIn(registrationId: string): CachedEntry | null {
  return readCache()[registrationId] ?? null;
}

export function cacheCheckIn(registrationId: string, data: CheckInData) {
  const cache = readCache();
  cache[registrationId] = { data, cachedAt: new Date().toISOString(), pendingSync: false };
  writeCache(cache);
}

// Records an optimistic, unconfirmed check-in made while offline.
export function markPendingCheckIn(registrationId: string, data: CheckInData) {
  const cache = readCache();
  cache[registrationId] = {
    data: { ...data, checked_in: true, checked_in_at: data.checked_in_at ?? new Date().toISOString() },
    cachedAt: new Date().toISOString(),
    pendingSync: true,
  };
  writeCache(cache);
}

function getAllPending(): { registrationId: string; entry: CachedEntry }[] {
  return Object.entries(readCache())
    .filter(([, entry]) => entry.pendingSync)
    .map(([registrationId, entry]) => ({ registrationId, entry }));
}

// Attempts to sync every queued offline check-in with the server. Safe to
// call repeatedly/concurrently (e.g. on mount and again on the 'online'
// event) — already-synced entries simply have nothing left to flush.
export async function flushPendingCheckIns(): Promise<{ synced: string[] }> {
  const pending = getAllPending();
  const synced: string[] = [];

  for (const { registrationId, entry } of pending) {
    try {
      const res = await fetch(`/api/checkin/${registrationId}`, { method: 'POST' });
      if (res.ok) {
        // The POST response is just { checked_in, checked_in_at } — merge the
        // confirmed timestamp into the already-cached full record rather than
        // replacing it wholesale.
        const json = await res.json().catch(() => ({}));
        cacheCheckIn(registrationId, {
          ...entry.data,
          checked_in: true,
          checked_in_at: json.checked_in_at ?? entry.data.checked_in_at,
        });
        synced.push(registrationId);
      }
      // Non-ok response (e.g. 403/404) — leave queued rather than dropping
      // it; a transient auth/session hiccup shouldn't lose the check-in.
    } catch {
      // Still offline — leave queued, try again next flush.
    }
  }

  return { synced };
}
