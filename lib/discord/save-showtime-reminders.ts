import type { SupabaseClient } from '@supabase/supabase-js';

// Shared upsert-then-delete-stale pattern for discord_showtime_reminders,
// used both server-side (panel API routes, with a service-role client) and
// client-side (EventModal.jsx, with the browser client) -- mirrors
// EventModal.jsx's saveDayHours: an upsert that only mentions lead_minutes/
// message never touches sent_at, so an already-fired reminder's dedup state
// survives an unrelated edit; rows whose lead_minutes is no longer present
// are deleted.
export interface ShowtimeReminderWrite {
  lead_minutes: number;
  message: string | null;
}

export interface SaveShowtimeRemindersResult {
  error: string | null;
}

// Pre-flight check usable before any write happens, so a duplicate can be
// caught (and the whole save aborted) before the owner's own row is
// touched at all -- avoids a partial save where the event/panel saves but
// its reminders don't.
export function findDuplicateLeadMinutes(reminders: ShowtimeReminderWrite[]): number | null {
  const seen = new Set<number>();
  for (const r of reminders) {
    if (seen.has(r.lead_minutes)) return r.lead_minutes;
    seen.add(r.lead_minutes);
  }
  return null;
}

export async function saveShowtimeReminders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, any, any>,
  ownerColumn: 'event_id' | 'panel_id',
  ownerId: string,
  reminders: ShowtimeReminderWrite[],
): Promise<SaveShowtimeRemindersResult> {
  const seen = new Set<number>();
  for (const r of reminders) {
    if (seen.has(r.lead_minutes)) {
      return { error: `A reminder for ${r.lead_minutes} minute(s) before showtime is configured more than once — each lead time can only be used once.` };
    }
    seen.add(r.lead_minutes);
  }

  if (reminders.length > 0) {
    const rows = reminders.map((r) => ({ [ownerColumn]: ownerId, lead_minutes: r.lead_minutes, message: r.message }));
    // onConflict must list every column in the unique constraint (both
    // event_id and panel_id, even though only one is ever non-null here) --
    // see the migration's comment on why this is a single full constraint
    // rather than two partial indexes.
    const { error } = await client
      .from('discord_showtime_reminders')
      .upsert(rows, { onConflict: 'event_id,panel_id,lead_minutes' });
    if (error) return { error: error.message };
  }

  const keepLeadMinutes = reminders.map((r) => r.lead_minutes);
  const deleteQuery = client.from('discord_showtime_reminders').delete().eq(ownerColumn, ownerId);
  const { error } = keepLeadMinutes.length > 0
    ? await deleteQuery.not('lead_minutes', 'in', `(${keepLeadMinutes.join(',')})`)
    : await deleteQuery;
  if (error) return { error: error.message };

  return { error: null };
}
