'use client';

import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useStreamerMode } from '@/contexts/StreamerModeContext';
import { redact } from '@/lib/redact';

type Attendee = {
  external_id: string;
  name: string;
  email: string | null;
  ticket_type: string | null;
  checked_in: boolean;
  status: string;
};

export default function EventbriteAttendeesTab({ eventId }: { eventId: string }) {
  const { streamerMode } = useStreamerMode();
  const [attendees, setAttendees] = useState<Attendee[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/events/${eventId}/eventbrite-attendees`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load attendees');
        if (!cancelled) setAttendees(data.attendees);
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-300">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          Read-only view of ticket holders on Eventbrite — pulled live, not stored here.
          These attendees can&apos;t be messaged or checked in from 123impact.
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : error ? (
        <Card className="p-6 flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </Card>
      ) : !attendees || attendees.length === 0 ? (
        <Card className="p-8 text-center text-gray-500">No attendees on Eventbrite yet.</Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="px-5 py-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Email</th>
                  <th className="pb-2 pr-4 font-medium">Ticket</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium">Checked in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {attendees.map((a) => (
                  <tr key={a.external_id} className="text-gray-700 dark:text-gray-300">
                    <td className="py-2 pr-4 font-medium">{redact(a.name, 'name', streamerMode)}</td>
                    <td className="py-2 pr-4">{a.email ? redact(a.email, 'email', streamerMode) : '—'}</td>
                    <td className="py-2 pr-4 text-gray-500 dark:text-gray-400">{a.ticket_type ?? '—'}</td>
                    <td className="py-2 pr-4 capitalize text-gray-500 dark:text-gray-400">{a.status}</td>
                    <td className="py-2">
                      {a.checked_in
                        ? <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                        : <span className="text-gray-400 dark:text-gray-500">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
