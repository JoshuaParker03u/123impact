// Event dates (events.date/end_date, shifts.shift_date, event_day_hours.event_date)
// are all stored as "YYYY-MM-DD" text, not a DATE column — matching the same
// text-based convention used for time fields (see lib/hours.ts).

export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly';

// Upper bound on how many occurrences a single "repeat" setup can generate
// in one request — keeps a mis-set end date from silently creating a huge
// number of events (each of which counts against the org's free-plan
// event quota).
export const MAX_OCCURRENCES = 52;

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Which occurrence of its weekday a date is within its month (1st, 2nd, 3rd...).
function weekdayOrdinalInMonth(date: Date): number {
  return Math.floor((date.getUTCDate() - 1) / 7) + 1;
}

// The Nth occurrence of `weekday` (0=Sun..6=Sat) in the given UTC year/month
// (0-indexed month). Falls back to the last occurrence of that weekday in
// the month if the Nth doesn't exist there (e.g. a "5th Wednesday" start
// date in a month where the target month only has 4 Wednesdays).
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const firstOccurrenceDay = 1 + ((weekday - firstOfMonth.getUTCDay() + 7) % 7);
  let targetDay = firstOccurrenceDay + (n - 1) * 7;

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  if (targetDay > daysInMonth) targetDay -= 7;

  return new Date(Date.UTC(year, month, targetDay));
}

// Shifts a "YYYY-MM-DD" string forward by `n` occurrences of `frequency`.
// Weekly/biweekly are pure day-count additions, which inherently preserve
// the day of week. Monthly preserves the day-of-week *position* instead of
// the numeric day — a "1st Wednesday" event recurs on the 1st Wednesday of
// each following month, not the same calendar date (which would drift onto
// different weekdays and, near month-end, could skip or double up months).
export function addOccurrences(dateStr: string, frequency: RecurrenceFrequency, n: number): string {
  const date = parseDate(dateStr);

  if (frequency === 'weekly')   return formatDate(new Date(date.getTime() + n * 7 * 24 * 60 * 60 * 1000));
  if (frequency === 'biweekly') return formatDate(new Date(date.getTime() + n * 14 * 24 * 60 * 60 * 1000));

  // monthly
  const weekday = date.getUTCDay();
  const ordinal = weekdayOrdinalInMonth(date);
  const targetMonthIndex = date.getUTCMonth() + n;
  const targetYear  = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  return formatDate(nthWeekdayOfMonth(targetYear, targetMonth, weekday, ordinal));
}

// Shifts a "YYYY-MM-DD" string by a fixed number of days — used to carry a
// multi-day event's internal day offsets (event_day_hours, shift_date) along
// when the whole event shifts to a new occurrence.
export function shiftDateByDays(dateStr: string, days: number): string {
  return formatDate(new Date(parseDate(dateStr).getTime() + days * 24 * 60 * 60 * 1000));
}

// Whole-day difference between two "YYYY-MM-DD" strings (b - a).
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / (24 * 60 * 60 * 1000));
}

const ORDINAL_WORDS = ['', '1st', '2nd', '3rd', '4th', '5th'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Human-readable description of the day-of-week pattern a monthly
// recurrence will follow, e.g. "the 1st Wednesday" — shown in the UI so an
// admin can confirm what "Monthly" actually means for their chosen date.
export function describeMonthlyPattern(dateStr: string): string {
  const date = parseDate(dateStr);
  const ordinal = weekdayOrdinalInMonth(date);
  return `the ${ORDINAL_WORDS[ordinal] ?? `${ordinal}th`} ${WEEKDAY_NAMES[date.getUTCDay()]}`;
}

// How many occurrences fit between a start date and an end date (inclusive)
// at the given frequency, capped at MAX_OCCURRENCES.
export function countOccurrences(startDate: string, endDate: string, frequency: RecurrenceFrequency): number {
  let count = 1; // the start date itself is always occurrence #1
  while (count < MAX_OCCURRENCES && addOccurrences(startDate, frequency, count) <= endDate) {
    count++;
  }
  return count;
}
