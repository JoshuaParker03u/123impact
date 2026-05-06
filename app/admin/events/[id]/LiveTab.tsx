'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';

type LiveData = {
  checked_in_count: number;
  total_registered: number;
  pct:              number;
  by_type: {
    volunteer: { registered: number; checked_in: number };
    attendee:  { registered: number; checked_in: number };
    speaker:   { registered: number; checked_in: number };
  };
  speakers: { name: string; checked_in: boolean; checked_in_at: string | null }[];
};

function formatTime(ts: string | null) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function TypeRow({
  label, registered, checkedIn, warn,
}: { label: string; registered: number; checkedIn: number; warn?: boolean }) {
  const pct = registered > 0 ? Math.round((checkedIn / registered) * 100) : 0;
  return (
    <div className="flex items-center justify-between py-3 border-b dark:border-gray-700 last:border-0">
      <div className="flex items-center gap-2">
        {warn && checkedIn < registered && (
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
        )}
        <span className="font-medium text-gray-800 dark:text-gray-200">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500 dark:text-gray-400">{pct}%</span>
        <span className={`font-semibold tabular-nums ${
          warn && checkedIn < registered
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-gray-900 dark:text-gray-100'
        }`}>
          {checkedIn}/{registered}
        </span>
      </div>
    </div>
  );
}

export default function LiveTab({ eventId }: { eventId: string }) {
  const [data, setData]           = useState<LiveData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/live`);
      if (res.ok) {
        setData(await res.json());
        setLastRefresh(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;
  }

  if (!data) return null;

  const { checked_in_count, total_registered, pct, by_type, speakers } = data;
  const allVolsIn = by_type.volunteer.checked_in >= by_type.volunteer.registered && by_type.volunteer.registered > 0;

  return (
    <div className="space-y-5 max-w-lg mx-auto">
      {/* Auto-refresh notice */}
      <div className="flex justify-between items-center text-xs text-gray-400">
        <span>Auto-refreshes every 60 seconds</span>
        {lastRefresh && <span>Last updated {formatTime(lastRefresh.toISOString())}</span>}
      </div>

      {/* Hero count */}
      <Card className="p-8 text-center">
        <p className="text-7xl font-black text-gray-900 dark:text-gray-100 tabular-nums leading-none">
          {checked_in_count}
          <span className="text-4xl text-gray-400 font-semibold">/{total_registered}</span>
        </p>
        <p className="text-xl font-semibold text-gray-600 dark:text-gray-400 mt-2">Checked In</p>
        <div className="mt-4 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400">{pct}%</p>
      </Card>

      {/* By type */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
          By Attendee Type
        </h3>
        {by_type.volunteer.registered > 0 && (
          <TypeRow
            label="Volunteers"
            registered={by_type.volunteer.registered}
            checkedIn={by_type.volunteer.checked_in}
            warn
          />
        )}
        {by_type.attendee.registered > 0 && (
          <TypeRow
            label="Attendees"
            registered={by_type.attendee.registered}
            checkedIn={by_type.attendee.checked_in}
          />
        )}
        {by_type.speaker.registered > 0 && (
          <TypeRow
            label="Speakers"
            registered={by_type.speaker.registered}
            checkedIn={by_type.speaker.checked_in}
            warn
          />
        )}
      </Card>

      {/* Volunteer flag */}
      {by_type.volunteer.registered > 0 && !allVolsIn && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {by_type.volunteer.registered - by_type.volunteer.checked_in} volunteer
            {by_type.volunteer.registered - by_type.volunteer.checked_in !== 1 ? 's' : ''} not yet checked in
          </p>
        </div>
      )}

      {/* Speaker list — always visible */}
      {speakers.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Speakers
          </h3>
          <ul className="space-y-3">
            {speakers.map((s, i) => (
              <li key={i} className="flex items-center justify-between">
                <span className="font-medium text-gray-900 dark:text-gray-100">{s.name}</span>
                {s.checked_in ? (
                  <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400 text-sm font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    Checked In {s.checked_in_at ? `· ${formatTime(s.checked_in_at)}` : ''}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-sm font-semibold">
                    <Clock className="w-4 h-4" />
                    Not Yet Arrived
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
