// Shift start_time/end_time (and event_day_hours) are stored as "HH:MM" text,
// not a TIME column — see supabase/migrations/20260807000004_speaker_session_time.sql
// for the precedent. This computes a shift's scheduled duration in hours,
// handling shifts that cross midnight (end time earlier than start time).
export function shiftDurationHours(startTime: string | null | undefined, endTime: string | null | undefined): number {
  if (!startTime || !endTime) return 0;

  const toMinutes = (t: string): number | null => {
    const [h, m] = t.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  };

  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (start === null || end === null) return 0;

  let diffMinutes = end - start;
  if (diffMinutes <= 0) diffMinutes += 24 * 60; // overnight shift

  return Math.round((diffMinutes / 60) * 100) / 100;
}
