'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase';
import {
  type CheckInData,
  getCachedCheckIn,
  cacheCheckIn,
  markPendingCheckIn,
  flushPendingCheckIns,
} from '@/lib/offlineCheckin';

// For a real, full ISO timestamp (checked_in_at).
function formatTime(timeStr: string | null) {
  if (!timeStr) return '';
  try {
    return new Date(timeStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return timeStr;
  }
}

// Shift start/end times are stored as a bare time-of-day ("09:00" or
// "09:00:00"), not a full timestamp — new Date() can't parse that alone.
// Combine with the event's date first, same approach the admin event page
// uses (new Date(`${date}T${shift.start_time}`)).
function formatShiftTime(dateStr: string, timeStr: string | null) {
  if (!timeStr) return '';
  try {
    return new Date(`${dateStr}T${timeStr}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return timeStr;
  }
}

function formatDate(dateStr: string) {
  try {
    // Bare "YYYY-MM-DD" is parsed as UTC midnight by the Date constructor;
    // appending a local time-of-day avoids the off-by-one-day shift that
    // causes in timezones behind UTC. Same fix as formatDateRange() in the
    // admin event page.
    return new Date(dateStr + 'T00:00:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function CheckInPage() {
  const { registrationId } = useParams<{ registrationId: string }>();
  const router = useRouter();

  const [data, setData] = useState<CheckInData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [justCheckedIn, setJustCheckedIn] = useState(false);
  const [usingCachedData, setUsingCachedData] = useState(false);
  const [pendingSync, setPendingSync] = useState(false);
  const [isOfflineError, setIsOfflineError] = useState(false);

  const supabase = getBrowserClient();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsOfflineError(false);
    try {
      const res = await fetch(`/api/checkin/${registrationId}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed to load registration.');
        return;
      }
      const json = await res.json();
      setData(json);
      setUsingCachedData(false);
      setPendingSync(false);
      cacheCheckIn(registrationId, json);
    } catch {
      // Fetch itself failed (offline/unreachable) rather than the server
      // responding with a real error — fall back to whatever was last
      // cached for this registrant instead of a dead-end error card.
      const cached = getCachedCheckIn(registrationId);
      if (cached) {
        setData(cached.data);
        setUsingCachedData(true);
        setPendingSync(cached.pendingSync);
      } else {
        setIsOfflineError(true);
        setError('Network error. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [registrationId]);

  useEffect(() => { load(); }, [load]);

  // Retry any offline check-ins queued on this device — on mount (in case
  // one was queued in a previous session that never reconnected) and again
  // whenever the browser regains connectivity.
  useEffect(() => {
    async function trySync() {
      const { synced } = await flushPendingCheckIns();
      if (synced.includes(registrationId)) {
        setPendingSync(false);
        setUsingCachedData(false);
        load();
      }
    }
    trySync();
    window.addEventListener('online', trySync);
    return () => window.removeEventListener('online', trySync);
  }, [registrationId, load]);

  async function handleCheckIn() {
    setCheckingIn(true);
    try {
      const res = await fetch(`/api/checkin/${registrationId}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error ?? 'Check-in failed.');
        return;
      }
      if (json.already_checked_in) {
        // Refresh data to show current state
        await load();
        return;
      }
      setJustCheckedIn(true);
      setPendingSync(false);
      setData((prev) => prev ? { ...prev, checked_in: true, checked_in_at: json.checked_in_at } : prev);
    } catch {
      // The request never reached the server — queue it locally and update
      // the UI optimistically rather than blocking on an alert. Safe to
      // retry later: check_ins.registration_id is unique, so a duplicate
      // POST once back online just confirms rather than double-booking.
      if (data) {
        markPendingCheckIn(registrationId, data);
        setJustCheckedIn(true);
        setPendingSync(true);
        setData((prev) => prev ? { ...prev, checked_in: true, checked_in_at: new Date().toISOString() } : prev);
      } else {
        alert("You're offline and this registrant hasn't loaded yet — reconnect and try again.");
      }
    } finally {
      setCheckingIn(false);
    }
  }

  // ── Loading ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">{isOfflineError ? '📡' : '⚠️'}</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            {isOfflineError ? "Can't connect" : 'Registration not found'}
          </h1>
          <p className="text-gray-500 text-sm mb-4">{error}</p>
          {isOfflineError && (
            <button
              onClick={() => load()}
              className="text-sm text-blue-600 hover:underline"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { event, shift, registrant_name, checked_in, checked_in_at, is_staff_view } = data;

  // ── Already checked in (green state) ────────────────────
  if (checked_in) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50 p-6">
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            {justCheckedIn ? 'Checked In!' : 'Already Checked In'}
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            {checked_in_at ? formatTime(checked_in_at) : ''}
          </p>

          {pendingSync && (
            <div className="mb-4 text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
              Saved on this device — will sync once you&apos;re back online.
            </div>
          )}

          <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2 mb-6">
            <p className="font-semibold text-gray-900">{registrant_name}</p>
            <p className="text-sm text-gray-600">{event.title}</p>
            <p className="text-sm text-gray-500">{shift.name}</p>
          </div>

          {is_staff_view && (
            <button
              onClick={() => router.push(`/admin/events/${event.event_id}`)}
              className="text-sm text-blue-600 hover:underline"
            >
              Back to event
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Staff check-in view ──────────────────────────────────
  if (is_staff_view) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm w-full">
          {usingCachedData && (
            <div className="mb-4 text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
              Offline — showing the last info saved on this device.
            </div>
          )}

          <div className="mb-6">
            <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">{event.title}</p>
            <h1 className="text-2xl font-bold text-gray-900">{registrant_name}</h1>
            {data.registrant_email && (
              <p className="text-sm text-gray-500 mt-1">{data.registrant_email}</p>
            )}
          </div>

          <div className="bg-gray-50 rounded-xl p-4 space-y-2 mb-8">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Shift</span>
              <span className="font-medium text-gray-900">{shift.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Date</span>
              <span className="font-medium text-gray-900">{formatDate(event.date)}</span>
            </div>
            {shift.start_time && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Time</span>
                <span className="font-medium text-gray-900">
                  {formatShiftTime(event.date, shift.start_time)}
                  {shift.end_time ? ` – ${formatShiftTime(event.date, shift.end_time)}` : ''}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={handleCheckIn}
            disabled={checkingIn}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-lg font-semibold rounded-xl transition-colors"
          >
            {checkingIn ? 'Checking in…' : 'Check In'}
          </button>

          <button
            onClick={() => router.push(`/admin/events/${event.event_id}`)}
            className="w-full mt-3 py-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Registrant self-view (not staff, not checked in) ────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm w-full text-center">
        <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-1">{registrant_name}</h1>
        <p className="text-gray-500 text-sm mb-6">{event.title}</p>

        <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Shift</span>
            <span className="font-medium text-gray-900">{shift.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Date</span>
            <span className="font-medium text-gray-900">{formatDate(event.date)}</span>
          </div>
        </div>

        <div className="inline-flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Not yet checked in
        </div>
      </div>
    </div>
  );
}
