'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import AdminNavigation from '@/components/admin/AdminNavigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Calendar, MapPin, Clock, Users, ChevronDown, ChevronUp,
  Mail, FileText, ArrowLeft, Loader2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Volunteer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  registered_at: string;
}

interface Shift {
  id: string;
  shift_id: number;
  name: string;
  description: string | null;
  start_time: string;
  end_time: string;
  capacity: number;
  filled: number;
  volunteers?: Volunteer[];
}

interface Event {
  id: string;
  event_id: string;
  title: string;
  description: string | null;
  date: string;
  time: string;
  location: string;
  image_url: string | null;
  status: string;
  shifts: Shift[];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminEventDetailPage() {
  const params  = useParams();
  const router  = useRouter();
  const eventId = params.id as string;

  const [event,   setEvent]   = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loadingVolunteers, setLoadingVolunteers] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => { loadEvent(); }, []);

  async function loadEvent() {
    setLoading(true);

    const { data, error } = await supabase
      .from('events')
      .select(`
        id, event_id, title, description, date, time,
        location, image_url, status,
        shifts (
          id, shift_id, name, description,
          start_time, end_time, capacity
        )
      `)
      .eq('id', eventId)
      .single();

    if (error || !data) {
      console.error('Error loading event:', error);
      setLoading(false);
      return;
    }

    const shiftIds = (data.shifts ?? []).map((s) => s.id);
    const { data: regRows } = await supabase
      .from('volunteer_registrations')
      .select('shift_id')
      .in('shift_id', shiftIds);

    const countMap = (regRows ?? []).reduce<Record<string, number>>((acc, r) => {
      acc[r.shift_id] = (acc[r.shift_id] ?? 0) + 1;
      return acc;
    }, {});

    const sorted = [...(data.shifts ?? [])]
      .map((s) => ({ ...s, filled: countMap[s.id] ?? 0 }))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    setEvent({ ...data, shifts: sorted });
    setLoading(false);
  }

  async function toggleShift(shiftId: string) {
    if (expanded === shiftId) {
      setExpanded(null);
      return;
    }

    // Load volunteers for this shift if not already loaded
    const shift = event?.shifts.find((s) => s.id === shiftId);
    if (shift && !shift.volunteers) {
      setLoadingVolunteers(shiftId);
      const { data } = await supabase
        .from('volunteer_registrations')
        .select('id, name, email, phone, registered_at')
        .eq('shift_id', shiftId)
        .order('registered_at', { ascending: true });

      setEvent((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          shifts: prev.shifts.map((s) =>
            s.id === shiftId ? { ...s, volunteers: data ?? [] } : s
          ),
        };
      });
      setLoadingVolunteers(null);
    }

    setExpanded(shiftId);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <>
        <AdminNavigation />
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </>
    );
  }

  if (!event) {
    return (
      <>
        <AdminNavigation />
        <div className="max-w-5xl mx-auto px-4 py-8">
          <Card className="p-8 text-center">
            <p className="text-gray-600">Event not found.</p>
            <Button className="mt-4" onClick={() => router.push('/admin/events')}>
              Back to Events
            </Button>
          </Card>
        </div>
      </>
    );
  }

  const totalFilled   = event.shifts.reduce((s, sh) => s + (sh.filled ?? 0), 0);
  const totalCapacity = event.shifts.reduce((s, sh) => s + sh.capacity, 0);
  const fillPct       = totalCapacity > 0 ? Math.round((totalFilled / totalCapacity) * 100) : 0;

  return (
    <>
      <AdminNavigation />
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Back link */}
        <Link
          href="/admin/events"
          className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Events
        </Link>

        {/* Event header */}
        <Card className="p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{event.title}</h1>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  event.status === 'active'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  {event.status}
                </span>
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400 mt-2">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />{event.date}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />{event.time}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />{event.location}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {totalFilled}/{totalCapacity} volunteers ({fillPct}% full)
                </span>
              </div>

              {event.description && (
                <p className="mt-3 text-gray-700 dark:text-gray-300">{event.description}</p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 shrink-0">
              <Link href={`/admin/events/${event.id}/templates`}>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <FileText className="w-4 h-4" /> Email Templates
                </Button>
              </Link>
              <Link href={`/admin/messages?eventId=${event.id}`}>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Mail className="w-4 h-4" /> Message Volunteers
                </Button>
              </Link>
            </div>
          </div>
        </Card>

        {/* Shifts */}
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Shifts ({event.shifts.length})
        </h2>

        {event.shifts.length === 0 ? (
          <Card className="p-8 text-center text-gray-500">
            No shifts added yet.
          </Card>
        ) : (
          <div className="space-y-3">
            {event.shifts.map((shift) => {
              const isOpen   = expanded === shift.id;
              const isFull   = (shift.filled ?? 0) >= shift.capacity;
              const start    = new Date(shift.start_time);
              const end      = new Date(shift.end_time);

              return (
                <Card key={shift.id} className="overflow-hidden">
                  {/* Shift row */}
                  <button
                    className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    onClick={() => toggleShift(shift.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{shift.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        {start.toLocaleDateString()} &nbsp;
                        {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {' – '}
                        {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {shift.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{shift.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 ml-4">
                      <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                        isFull
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                      }`}>
                        {shift.filled ?? 0}/{shift.capacity}
                      </span>
                      {loadingVolunteers === shift.id
                        ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                        : isOpen
                          ? <ChevronUp className="w-4 h-4 text-gray-400" />
                          : <ChevronDown className="w-4 h-4 text-gray-400" />
                      }
                    </div>
                  </button>

                  {/* Volunteer list */}
                  {isOpen && (
                    <div className="border-t dark:border-gray-700 px-5 py-4 bg-gray-50 dark:bg-gray-800/50">
                      {!shift.volunteers || shift.volunteers.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">No volunteers registered yet.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                              <th className="pb-2 font-medium">Name</th>
                              <th className="pb-2 font-medium">Email</th>
                              <th className="pb-2 font-medium">Phone</th>
                              <th className="pb-2 font-medium">Registered</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {shift.volunteers.map((v) => (
                              <tr key={v.id} className="text-gray-700 dark:text-gray-300">
                                <td className="py-2 pr-4 font-medium">{v.name}</td>
                                <td className="py-2 pr-4">{v.email}</td>
                                <td className="py-2 pr-4">{v.phone ?? '—'}</td>
                                <td className="py-2 text-gray-400 dark:text-gray-500">
                                  {new Date(v.registered_at).toLocaleDateString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
