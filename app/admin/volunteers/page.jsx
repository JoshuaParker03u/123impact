'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSearchParams } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase';
import MessageComposer from '@/components/MessageComposer';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Users, Calendar, Clock, Mail, Phone, Loader2, Search, X, CheckCircle2 } from 'lucide-react';
import { useStreamerMode } from '@/contexts/StreamerModeContext';
import { redact } from '@/lib/redact';

const AVATAR_COLORS = [
  'from-blue-500 to-blue-700',
  'from-purple-500 to-purple-700',
  'from-green-500 to-green-700',
  'from-orange-500 to-orange-700',
  'from-pink-500 to-pink-700',
  'from-teal-500 to-teal-700',
];

// Matches the colors used for attendee_type breakdowns on the Analytics tab
const ROLE_BADGE = {
  volunteer: { label: 'Volunteer', className: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
  attendee:  { label: 'Attendee',  className: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
  speaker:   { label: 'Speaker',   className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
};

function RoleBadge({ type }) {
  const role = ROLE_BADGE[type] ?? ROLE_BADGE.volunteer;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${role.className}`}>
      {role.label}
    </span>
  );
}

function VolunteerAvatar({ name }) {
  const initials = name ? name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() : '?';
  const color = AVATAR_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];
  return (
    <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
      {initials}
    </div>
  );
}

// Compares plain "YYYY-MM-DD" strings directly rather than going through
// Date objects — avoids the UTC-midnight parsing pitfall where new
// Date("2026-05-26") shifts a day off in timezones behind UTC.
function isPastDate(dateStr) {
  if (!dateStr) return false;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return dateStr < todayStr;
}

function CheckInStatus({ registrationId, checkedInAt, isOverride, eventDate, onCheckedIn, onUnchecked, canOverride }) {
  const [open, setOpen]     = useState(false);
  const [saving, setSaving] = useState(false);
  const [coords, setCoords] = useState(null);
  const triggerRef = useRef(null);
  const menuRef     = useRef(null);

  // The dropdown is portaled to document.body (see below) so it can escape
  // the admin table's overflow-x-auto wrapper, which otherwise clips any
  // position: absolute content that overflows the table's bottom edge.
  function openMenu(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, left: rect.left });
    setOpen((o) => !o);
  }

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        menuRef.current && !menuRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function markCheckedIn() {
    setSaving(true);
    try {
      const res = await fetch(`/api/checkin/${registrationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ override: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error ?? 'Failed to check in.');
        return;
      }
      onCheckedIn(registrationId, json.checked_in_at ?? new Date().toISOString(), json.is_override ?? true);
      setOpen(false);
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function undoCheckIn() {
    if (!confirm('Undo this check-in? This removes the check-in record.')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/checkin/${registrationId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error ?? 'Failed to undo check-in.');
        return;
      }
      onUnchecked(registrationId);
      setOpen(false);
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (checkedInAt) {
    // Only a manual override can be undone — a natural check-in (real
    // scan/link tap) is a permanent ledger entry, not just a static badge.
    // Undo is also admin-only (see canOverride below), so non-admins only
    // ever see the plain badge even for an overridden check-in.
    if (!isOverride || !canOverride) {
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Checked in
          {isOverride && <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500">(override)</span>}
        </span>
      );
    }

    return (
      <div className="relative inline-block">
        <button
          ref={triggerRef}
          onClick={openMenu}
          className="flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 hover:underline"
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> Checked in
          <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500">(override)</span>
        </button>
        {open && coords && createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: coords.top, left: coords.left }}
            className="z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[160px]"
          >
            <button
              onClick={undoCheckIn}
              disabled={saving}
              className="w-full text-left px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
              Undo check-in
            </button>
          </div>,
          document.body
        )}
      </div>
    );
  }

  if (!isPastDate(eventDate)) {
    return <span className="text-xs text-gray-400 dark:text-gray-500">Not yet</span>;
  }

  if (!canOverride) {
    return <span className="text-xs font-medium text-amber-600 dark:text-amber-400">No-show</span>;
  }

  // No-show — clickable, lets org admins manually override with a real
  // check-in (e.g. someone who showed up but scanning/link check-in didn't
  // happen). Restricted to org admins, not event admins — this reaches
  // across the whole org-wide volunteers list, unlike the natural
  // scan/link check-in an event admin handles day-of.
  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        onClick={openMenu}
        className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
      >
        No-show
      </button>
      {open && coords && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left }}
          className="z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[160px]"
        >
          <button
            onClick={markCheckedIn}
            disabled={saving}
            className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 text-green-600 dark:text-green-400" />}
            Mark as checked in
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}

const supabase = getBrowserClient();

import { Suspense } from 'react';

function AdminVolunteersPage() {
  const { currentOrganization, loading: orgLoading, isAdmin: isOrgAdmin } = useOrganization();
  const { streamerMode } = useStreamerMode();
  const [messageVolunteer, setMessageVolunteer] = useState(null);
  const [removingVolunteer, setRemovingVolunteer] = useState(null);
  const [removing, setRemoving] = useState(false);
  const searchParams = useSearchParams();
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [eventFilter, setEventFilter] = useState(searchParams.get('event') ?? 'current');
  const [roleFilter, setRoleFilter] = useState(searchParams.get('role') ?? 'all');
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (currentOrganization?.id) {
      fetchData();
    }
  }, [currentOrganization?.id]);

  const fetchData = async () => {
    if (!currentOrganization) return;

    setLoading(true);

    try {
      // Fetch all events for this organization
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, title, event_id, status')
        .eq('organization_id', currentOrganization.id)
        .order('date', { ascending: false });

      if (eventsError) {
        console.error('Error fetching events:', eventsError);
        setEvents([]);
      } else {
        setEvents(eventsData || []);
      }

      const eventIds = eventsData?.map(e => e.id) || [];
      
      if (eventIds.length === 0) {
        setVolunteers([]);
        setLoading(false);
        return;
      }

      // Fetch volunteer registrations for these events directly by event_id
      // (set on every registration, shift-based or shiftless) rather than
      // going through shifts first — the old shifts-first join silently
      // excluded shiftless-event registrations entirely, since they have no
      // shift_id to match against.
      const { data: volunteersData, error: volunteersError } = await supabase
        .from('volunteer_registrations')
        .select(`
          id,
          name,
          email,
          phone,
          registered_at,
          shift_id,
          event_id,
          attendee_type,
          shifts (
            id,
            name,
            start_time,
            end_time
          ),
          events (
            id,
            title,
            event_id,
            date
          )
        `)
        .in('event_id', eventIds)
        .order('registered_at', { ascending: false });

      if (volunteersError) {
        console.error('Error fetching volunteers:', volunteersError);
        setVolunteers([]);
        setLoading(false);
        return;
      }

      // Attach check-in status. check_ins isn't joined above since it's a
      // separate one-to-zero-or-one relation keyed by registration_id, not a
      // direct FK on volunteer_registrations.
      const registrationIds = (volunteersData || []).map(v => v.id);
      const { data: checkInsData } = registrationIds.length
        ? await supabase
            .from('check_ins')
            .select('registration_id, checked_in_at, is_override')
            .in('registration_id', registrationIds)
        : { data: [] };

      const checkInMap = new Map((checkInsData || []).map(c => [c.registration_id, c]));
      const withCheckIn = (volunteersData || []).map(v => ({
        ...v,
        checked_in_at: checkInMap.get(v.id)?.checked_in_at ?? null,
        is_override: checkInMap.get(v.id)?.is_override ?? false,
      }));

      // Don't set filteredVolunteers here — leave it to the effect that
      // watches `volunteers` (below), which applies the current filters.
      // Setting it directly to the unfiltered list caused a one-frame flash
      // of every registration before narrowing down to "current" events.
      setVolunteers(withCheckIn);
    } catch (error) {
      console.error('Unexpected error in fetchData:', error);
    } finally {
      setLoading(false);
    }
  };

  const removeVolunteer = async () => {
    const volunteer = removingVolunteer;
    if (!volunteer) return;
    setRemoving(true);

    const { error } = await supabase
      .from('volunteer_registrations')
      .delete()
      .eq('id', volunteer.id);

    if (error) {
      alert('Failed to remove volunteer: ' + error.message);
      setRemoving(false);
      return;
    }

    // Decrement shift filled count — shiftless registrations have no
    // shift_id and no equivalent counter to decrement (their capacity is
    // computed live from the registrations table, not tracked separately).
    if (volunteer.shift_id) {
      await supabase.rpc('decrement_shift_filled', { p_shift_id: volunteer.shift_id });
    }

    // Cancel any pending scheduled messages to this volunteer
    await fetch(
      `/api/messages/cancel-volunteer?email=${encodeURIComponent(volunteer.email)}&org_id=${currentOrganization.id}`,
      { method: 'DELETE' }
    );

    setVolunteers((prev) => prev.filter((v) => v.id !== volunteer.id));
    setRemoving(false);
    setRemovingVolunteer(null);
  };

  const handleCheckedIn = (registrationId, checkedInAt, isOverride) => {
    setVolunteers((prev) =>
      prev.map((v) => (v.id === registrationId ? { ...v, checked_in_at: checkedInAt, is_override: isOverride } : v))
    );
  };

  const handleUnchecked = (registrationId) => {
    setVolunteers((prev) =>
      prev.map((v) => (v.id === registrationId ? { ...v, checked_in_at: null, is_override: false } : v))
    );
  };

  // Derived directly from state on every render (not a separate state
  // variable updated via effect) so there's no in-between render where it
  // still holds the previous/unfiltered list — that lag was causing a
  // visible flash of every registration before narrowing to "current".
  let filteredVolunteers = volunteers;

  if (searchTerm) {
    const search = searchTerm.toLowerCase();
    filteredVolunteers = filteredVolunteers.filter(v =>
      v.name.toLowerCase().includes(search) ||
      v.email.toLowerCase().includes(search)
    );
  }

  // Event filter — grouped by status rather than listing every event by
  // name, which got unwieldy once an org has more than a handful.
  if (eventFilter === 'current') {
    const currentIds = new Set(events.filter(e => ['active', 'ongoing'].includes(e.status)).map(e => e.id));
    filteredVolunteers = filteredVolunteers.filter(v => currentIds.has(v.event_id));
  } else if (eventFilter === 'past') {
    const pastIds = new Set(events.filter(e => ['completed', 'cancelled'].includes(e.status)).map(e => e.id));
    filteredVolunteers = filteredVolunteers.filter(v => pastIds.has(v.event_id));
  }

  // Role filter
  if (roleFilter !== 'all') {
    filteredVolunteers = filteredVolunteers.filter(v => (v.attendee_type ?? 'volunteer') === roleFilter);
  }

  // Events stat: only active/ongoing events count as "active" — completed
  // and cancelled events are enumerated separately rather than folded in.
  const activeEventsCount    = events.filter(e => ['active', 'ongoing'].includes(e.status)).length;
  const completedEventsCount = events.filter(e => e.status === 'completed').length;
  const cancelledEventsCount = events.filter(e => e.status === 'cancelled').length;

  // Registrations stat: aggregates all three roles, broken out individually
  // rather than left implicit under the "Volunteers" label.
  const roleCounts = volunteers.reduce((acc, v) => {
    const type = v.attendee_type ?? 'volunteer';
    acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {});

  if (orgLoading) {
    return (
      <>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </>
    );
  }

  if (!currentOrganization) {
    return (
      <>
        <div className="container mx-auto px-4 py-8">
          <Card className="p-8 text-center">
            <p className="text-gray-600">No organization selected</p>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Volunteers</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage volunteer registrations for {currentOrganization.name}
          </p>
        </div>

        {/* Filters */}
        <Card className="p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
            >
              <option value="current">Current Events</option>
              <option value="all">All Events</option>
              <option value="past">Past Events</option>
            </select>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
            >
              <option value="all">All Roles</option>
              <option value="volunteer">Volunteer</option>
              <option value="attendee">Attendee</option>
              <option value="speaker">Speaker</option>
            </select>
          </div>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-full">
                <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Registrations</p>
                <p className="text-2xl font-bold">{volunteers.length}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {roleCounts.volunteer ?? 0} volunteer{(roleCounts.volunteer ?? 0) !== 1 ? 's' : ''} &middot;{' '}
                  {roleCounts.attendee ?? 0} attendee{(roleCounts.attendee ?? 0) !== 1 ? 's' : ''} &middot;{' '}
                  {roleCounts.speaker ?? 0} speaker{(roleCounts.speaker ?? 0) !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-full">
                <Calendar className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Active Events</p>
                <p className="text-2xl font-bold">{activeEventsCount}</p>
                {(completedEventsCount > 0 || cancelledEventsCount > 0) && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {completedEventsCount} completed &middot; {cancelledEventsCount} cancelled
                  </p>
                )}
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-full">
                <Clock className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Showing</p>
                <p className="text-2xl font-bold">{filteredVolunteers.length}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        )}

        {/* Empty State */}
        {!loading && volunteers.length === 0 && (
          <Card className="p-12 text-center">
            <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">No volunteers yet</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Volunteers will appear here once they sign up for your events
            </p>
          </Card>
        )}

        {/* Volunteers Table — desktop */}
        {!loading && filteredVolunteers.length > 0 && (
          <>
            <Card className="hidden sm:block overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                    <tr>
                      <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Volunteer</th>
                      <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Event</th>
                      <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Shift</th>
                      <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Registered</th>
                      <th className="text-left p-4 font-semibold text-gray-700 dark:text-gray-300">Check-in</th>
                      <th className="p-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVolunteers.map((volunteer) => (
                      <tr key={volunteer.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <VolunteerAvatar name={volunteer.name} />
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-gray-900 dark:text-gray-100">{redact(volunteer.name, 'name', streamerMode)}</p>
                                <RoleBadge type={volunteer.attendee_type} />
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                                {streamerMode
                                  ? <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{redact(volunteer.email, 'email', streamerMode)}</span>
                                  : <button onClick={() => setMessageVolunteer(volunteer)} className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Mail className="w-3 h-3" />{volunteer.email}</button>}
                                {volunteer.phone && (streamerMode
                                  ? <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{redact(volunteer.phone, 'phone', streamerMode)}</span>
                                  : <a href={`tel:${volunteer.phone}`} className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Phone className="w-3 h-3" />{volunteer.phone}</a>)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <p className="font-medium text-gray-900 dark:text-gray-100">{volunteer.events?.title || '—'}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{volunteer.events?.date || ''}</p>
                        </td>
                        <td className="p-4">
                          <p className="font-medium text-gray-900 dark:text-gray-100">{volunteer.shift_id ? (volunteer.shifts?.name || '—') : 'Direct registration'}</p>
                          {volunteer.shift_id && (
                            <p className="text-sm text-gray-600 dark:text-gray-400">{volunteer.shifts?.start_time || ''} - {volunteer.shifts?.end_time || ''}</p>
                          )}
                        </td>
                        <td className="p-4">
                          <p className="text-sm text-gray-600 dark:text-gray-400">{new Date(volunteer.registered_at).toLocaleDateString()}</p>
                        </td>
                        <td className="p-4">
                          <CheckInStatus
                            registrationId={volunteer.id}
                            checkedInAt={volunteer.checked_in_at}
                            isOverride={volunteer.is_override}
                            eventDate={volunteer.events?.date}
                            onCheckedIn={handleCheckedIn}
                            onUnchecked={handleUnchecked}
                            canOverride={isOrgAdmin}
                          />
                        </td>
                        <td className="p-4 text-right">
                          {isOrgAdmin && (
                            <button
                              onClick={() => setRemovingVolunteer(volunteer)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                              title="Remove from shift"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Volunteers Cards — mobile */}
            <div className="sm:hidden space-y-3">
              {filteredVolunteers.map((volunteer) => (
                <Card key={volunteer.id} className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <VolunteerAvatar name={volunteer.name} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{redact(volunteer.name, 'name', streamerMode)}</p>
                          <RoleBadge type={volunteer.attendee_type} />
                        </div>
                        <div className="flex flex-col gap-0.5 mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                          {streamerMode
                            ? <span className="flex items-center gap-1 truncate"><Mail className="w-3 h-3 flex-shrink-0" />{redact(volunteer.email, 'email', streamerMode)}</span>
                            : <button onClick={() => setMessageVolunteer(volunteer)} className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate"><Mail className="w-3 h-3 flex-shrink-0" />{volunteer.email}</button>}
                          {volunteer.phone && (streamerMode
                            ? <span className="flex items-center gap-1"><Phone className="w-3 h-3 flex-shrink-0" />{redact(volunteer.phone, 'phone', streamerMode)}</span>
                            : <a href={`tel:${volunteer.phone}`} className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Phone className="w-3 h-3 flex-shrink-0" />{volunteer.phone}</a>)}
                        </div>
                      </div>
                    </div>
                    {isOrgAdmin && (
                      <button
                        onClick={() => setRemovingVolunteer(volunteer)}
                        className="ml-3 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors flex-shrink-0"
                        title="Remove from shift"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Event</p>
                      <p className="font-medium text-gray-800 dark:text-gray-200 leading-snug">{volunteer.events?.title || '—'}</p>
                      <p className="text-gray-500 dark:text-gray-400 text-xs">{volunteer.events?.date || ''}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Shift</p>
                      <p className="font-medium text-gray-800 dark:text-gray-200 leading-snug">{volunteer.shift_id ? (volunteer.shifts?.name || '—') : 'Direct registration'}</p>
                      {volunteer.shift_id && (
                        <p className="text-gray-500 dark:text-gray-400 text-xs">{volunteer.shifts?.start_time || ''} – {volunteer.shifts?.end_time || ''}</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Registered {new Date(volunteer.registered_at).toLocaleDateString()}
                    </p>
                    <CheckInStatus
                      registrationId={volunteer.id}
                      checkedInAt={volunteer.checked_in_at}
                      isOverride={volunteer.is_override}
                      eventDate={volunteer.events?.date}
                      onCheckedIn={handleCheckedIn}
                      onUnchecked={handleUnchecked}
                      canOverride={isOrgAdmin}
                    />
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* No Results After Filter */}
        {!loading && volunteers.length > 0 && filteredVolunteers.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-gray-600 dark:text-gray-400">No volunteers match your filters</p>
          </Card>
        )}
      </div>

      {messageVolunteer && (
        <MessageComposer
          isOpen={!!messageVolunteer}
          onClose={() => setMessageVolunteer(null)}
          volunteerEmail={messageVolunteer.email}
          volunteerName={messageVolunteer.name}
        />
      )}

      {removingVolunteer && (
        <ConfirmDeleteModal
          title="Remove Volunteer"
          message={
            <>
              Remove <span className="font-medium text-gray-900 dark:text-gray-100">{removingVolunteer.name}</span> from {removingVolunteer.shift_id ? removingVolunteer.shifts?.name : (removingVolunteer.events?.title || 'this event')}?
            </>
          }
          confirmLabel="Remove"
          loading={removing}
          onCancel={() => setRemovingVolunteer(null)}
          onConfirm={removeVolunteer}
        />
      )}
    </>
  );
}

export default function VolunteersPageWrapper() {
  return <Suspense><AdminVolunteersPage /></Suspense>;
}