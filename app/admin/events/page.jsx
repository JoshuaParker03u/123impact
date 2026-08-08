'use client';

import { useState, useEffect } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { getBrowserClient } from '@/lib/supabase';
import EventModal from '@/components/admin/EventModal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Calendar, MapPin, Users, Clock, Plus, Edit, Trash2, ChevronDown, ChevronUp, Loader2, Search, ArrowRight, Copy, AlertTriangle, Mail, CalendarClock } from 'lucide-react';
import Link from 'next/link';
import MessageComposer from '@/components/MessageComposer';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal';
import SeriesManagerModal from '@/components/admin/SeriesManagerModal';

const supabase = getBrowserClient();

// Display event.time: handles both legacy "9:00 AM - 3:00 PM" strings and new "HH:MM" format
function formatEventTime(time) {
  if (!time) return '';
  if (/^\d{2}:\d{2}$/.test(time)) {
    const [h, m] = time.split(':').map(Number);
    const p = h < 12 ? 'AM' : 'PM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${m.toString().padStart(2, '0')} ${p}`;
  }
  return time;
}

export default function AdminEventsPage() {
  const { currentOrganization, loading: orgLoading, isAdmin } = useOrganization();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedEvent, setExpandedEvent] = useState(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [editingShift, setEditingShift] = useState(null);
  const [selectedEventForShift, setSelectedEventForShift] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [duplicatingEventId, setDuplicatingEventId] = useState(null);
  const [deletingEvent, setDeletingEvent] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [resolvingEventId, setResolvingEventId] = useState(null);
  const [messagingEvent, setMessagingEvent] = useState(null);
  const [manageSeriesId, setManageSeriesId] = useState(null);
  const [orgPlan, setOrgPlan] = useState('free');

  // Fetch events when organization changes
  useEffect(() => {
    if (currentOrganization?.id) {
      fetchEvents();
    }
  }, [currentOrganization?.id]);

  const fetchEvents = async () => {
    if (!currentOrganization) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('events')
      .select(`
        *,
        shifts (
          id,
          shift_id,
          name,
          description,
          start_time,
          end_time,
          capacity,
          shift_date
        ),
        event_day_hours (id, event_date, start_time, end_time)
      `)
      .eq('organization_id', currentOrganization.id)
      .order('date', { ascending: true });

    if (error) {
      console.error('Error fetching events:', error);
      setLoading(false);
      return;
    }

    // Count volunteer registrations per shift
    const allShiftIds = (data || []).flatMap(e => e.shifts?.map(s => s.id) ?? []);
    let countMap = {};
    if (allShiftIds.length > 0) {
      const { data: regRows } = await supabase
        .from('volunteer_registrations')
        .select('shift_id, is_waitlisted')
        .in('shift_id', allShiftIds);
      countMap = (regRows || []).reduce((acc, r) => {
        if (!acc[r.shift_id]) acc[r.shift_id] = { filled: 0, waitlisted: 0 };
        if (r.is_waitlisted) acc[r.shift_id].waitlisted++;
        else acc[r.shift_id].filled++;
        return acc;
      }, {});
    }

    // Count attendee/speaker registrations per event (these are shiftless,
    // so they aren't covered by the shift_id-scoped query above)
    const eventIds = (data || []).map(e => e.id);
    let roleCountMap = {};
    if (eventIds.length > 0) {
      const { data: roleRows } = await supabase
        .from('volunteer_registrations')
        .select('event_id, attendee_type')
        .in('event_id', eventIds)
        .in('attendee_type', ['attendee', 'speaker']);
      roleCountMap = (roleRows || []).reduce((acc, r) => {
        if (!acc[r.event_id]) acc[r.event_id] = { attendee: 0, speaker: 0 };
        acc[r.event_id][r.attendee_type]++;
        return acc;
      }, {});
    }

    const enriched = (data || []).map(event => ({
      ...event,
      shifts: (event.shifts || []).map(shift => ({
        ...shift,
        filled:    countMap[shift.id]?.filled    ?? 0,
        waitlisted: countMap[shift.id]?.waitlisted ?? 0,
      })),
      attendeeCount: roleCountMap[event.id]?.attendee ?? 0,
      speakerCount:  roleCountMap[event.id]?.speaker ?? 0,
    }));

    setEvents(enriched);
    setLoading(false);

    // Fetch org plan for feature gating
    const { data: orgData } = await supabase
      .from('organizations')
      .select('plan')
      .eq('id', currentOrganization.id)
      .maybeSingle();
    setOrgPlan(orgData?.plan ?? 'free');
  };

  const handleCreateEvent = () => {
    setEditingEvent(null);
    setShowEventModal(true);
  };

  const handleEditEvent = (event) => {
    setEditingEvent(event);
    setShowEventModal(true);
  };

  const handleDeleteEvent = async (eventId) => {
    setDeleting(true);
    const res = await fetch(`/api/events/${eventId}`, { method: 'DELETE' });
    const data = await res.json();
    setDeleting(false);

    if (!res.ok) {
      alert('Error deleting event: ' + (data.error ?? 'Unknown error'));
    } else {
      setDeletingEvent(null);
      fetchEvents();
    }
  };

  const resolveEventStatus = async (eventId, newStatus) => {
    setResolvingEventId(eventId);
    const { error } = await supabase.from('events').update({ status: newStatus }).eq('id', eventId);
    if (error) {
      alert('Error updating event status: ' + error.message);
    } else {
      setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, status: newStatus } : e)));
    }
    setResolvingEventId(null);
  };

  const handleDuplicateEvent = async (eventId) => {
    setDuplicatingEventId(eventId);
    try {
      const res = await fetch(`/api/events/${eventId}/duplicate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Unknown error');
      await fetchEvents();
    } catch (error) {
      alert('Error duplicating event: ' + error.message);
    } finally {
      setDuplicatingEventId(null);
    }
  };

  const handleAddShift = (event) => {
    setSelectedEventForShift(event);
    setEditingShift(null);
    setShowShiftModal(true);
  };

  const handleEditShift = (shift, event) => {
    setSelectedEventForShift(event);
    setEditingShift(shift);
    setShowShiftModal(true);
  };

  const handleDeleteShift = async (shiftId, filled) => {
    const msg = filled > 0
      ? `This shift has ${filled} volunteer${filled !== 1 ? 's' : ''} registered. Deleting it will remove their registrations. Continue?`
      : 'Delete this shift?';
    if (!confirm(msg)) return;

    const { error } = await supabase
      .from('shifts')
      .delete()
      .eq('id', shiftId);

    if (error) {
      alert('Error deleting shift: ' + error.message);
    } else {
      fetchEvents();
    }
  };

  // Loading states
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

  const STATUS_ORDER = { ongoing: 0, active: 1, completed: 2, cancelled: 3 };
  const today = new Date().toISOString().split('T')[0];

  const visibleEvents = events
    .filter((e) => {
      const matchesSearch = !searchTerm || e.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      const orderDiff = (STATUS_ORDER[a.status] ?? 2) - (STATUS_ORDER[b.status] ?? 2);
      if (orderDiff !== 0) return orderDiff;
      return a.date.localeCompare(b.date);
    });

  const statusBadgeClass = {
    active:    'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    ongoing:   'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
    cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    completed: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  };

  return (
    <>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Events</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{currentOrganization.name}</p>
          </div>
          {isAdmin && (
            <Button onClick={handleCreateEvent} className="bg-gradient-to-br from-blue-600 to-purple-600 hover:opacity-90">
              <Plus className="w-4 h-4 mr-2" />
              Create Event
            </Button>
          )}
        </div>

        {/* Search + Filter bar */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search events…"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        )}

        {/* Empty State — no events at all */}
        {!loading && events.length === 0 && (
          <Card className="p-12 text-center">
            <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">No events yet</h2>
            {isAdmin ? (
              <>
                <p className="text-gray-600 dark:text-gray-400 mb-6">Create your first event to get started</p>
                <Button onClick={handleCreateEvent} className="bg-gradient-to-br from-blue-600 to-purple-600 hover:opacity-90">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Event
                </Button>
              </>
            ) : (
              <p className="text-gray-600 dark:text-gray-400">No events have been created for this organization yet.</p>
            )}
          </Card>
        )}

        {/* Empty State — no results after filter */}
        {!loading && events.length > 0 && visibleEvents.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-gray-600 dark:text-gray-400">No events match your search or filter.</p>
          </Card>
        )}

        {/* Events List */}
        {!loading && visibleEvents.length > 0 && (
          <div className="space-y-4">
            {visibleEvents.map((event) => {
              const isExpanded = expandedEvent === event.id;
              const totalVolunteers = event.shifts?.reduce((sum, shift) => sum + (shift.filled || 0), 0) || 0;
              const totalCapacity   = event.shifts?.reduce((sum, shift) => sum + shift.capacity, 0) || 0;
              const totalWaitlisted = event.shifts?.reduce((sum, shift) => sum + (shift.waitlisted || 0), 0) || 0;
              const isStale = ['active', 'ongoing'].includes(event.status) && (event.end_date ?? event.date) < today;

              return (
                <Card key={event.id} className="overflow-hidden">
                  {/* Event Header */}
                  <div className="p-6">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{event.title}</h2>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusBadgeClass[event.status] ?? statusBadgeClass.completed}`}>
                            {event.status}
                          </span>
                          {event.platform_source && (
                            <span
                              title={`Imported from ${event.platform_source} — this event's details are kept in sync automatically and may be overwritten by changes made there`}
                              className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 capitalize"
                            >
                              {event.platform_source}
                            </span>
                          )}
                          {event.series_id && (
                            <span
                              title="Part of a recurring series"
                              className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                            >
                              Recurring
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400 mb-3">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {event.end_date && event.end_date !== event.date
                              ? `${event.date} – ${event.end_date}`
                              : event.date}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {formatEventTime(event.time)}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {event.location}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {totalVolunteers}/{totalCapacity} volunteers
                            {totalWaitlisted > 0 && (
                              <span className="ml-1 text-amber-600 dark:text-amber-400">
                                · {totalWaitlisted} waitlisted
                              </span>
                            )}
                          </span>
                          {event.attendee_enabled && (
                            <span className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {event.attendeeCount} attendee{event.attendeeCount === 1 ? '' : 's'}
                            </span>
                          )}
                          {event.speaker_enabled && (
                            <span className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {event.speakerCount} speaking session{event.speakerCount === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                        {event.description && (
                          <p className="text-gray-700 dark:text-gray-300">{event.description}</p>
                        )}
                      </div>
                      <div className="flex gap-2 mt-3 sm:mt-0 sm:ml-4">
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditEvent(event)}
                            title="Edit event"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setMessagingEvent(event)}
                            title="Message registrants"
                          >
                            <Mail className="w-4 h-4" />
                          </Button>
                        )}
                        {isAdmin && event.series_id && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setManageSeriesId(event.series_id)}
                            title="Manage series"
                            className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-400 dark:border-indigo-900 dark:hover:bg-indigo-900/20"
                          >
                            <CalendarClock className="w-4 h-4" />
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDuplicateEvent(event.id)}
                            disabled={duplicatingEventId === event.id}
                            title="Duplicate event"
                          >
                            {duplicatingEventId === event.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Copy className="w-4 h-4" />}
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeletingEvent(event)}
                            title="Delete event"
                            className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:border-red-900 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {isAdmin && isStale && (
                      <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        <span className="flex-1">This event&apos;s date has passed but it&apos;s still marked {event.status}.</span>
                        {resolvingEventId === event.id ? (
                          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                        ) : (
                          <>
                            <button
                              onClick={() => resolveEventStatus(event.id, 'completed')}
                              className="text-xs px-2 py-1 rounded border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
                            >
                              Complete
                            </button>
                            <button
                              onClick={() => resolveEventStatus(event.id, 'cancelled')}
                              className="text-xs px-2 py-1 rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Shifts Toggle / Manage footer */}
                    <div className="flex items-center justify-between pt-4 border-t dark:border-gray-700">
                      {!event.is_shiftless && (
                        <button
                          onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          {event.shifts?.length || 0} Shifts
                        </button>
                      )}
                      {event.is_shiftless && <span />}
                      <Link
                        href={`/admin/events/${event.event_id}`}
                        className="flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Manage <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>

                  {/* Shifts List (Collapsible) */}
                  {isExpanded && !event.is_shiftless && (
                    <div className="border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-6">
                      {!event.shifts || event.shifts.length === 0 ? (
                        <p className="text-gray-600 dark:text-gray-400 text-center py-4">No shifts yet. Add one to get started!</p>
                      ) : (
                        <div className="space-y-3">
                          {event.shifts.map((shift) => {
                            const spotsLeft = shift.capacity - (shift.filled || 0);
                            const isFull = spotsLeft <= 0;

                            return (
                              <div
                                key={shift.id}
                                className="bg-white dark:bg-gray-800 rounded-lg p-4 flex justify-between items-center"
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-1">
                                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{shift.name}</h3>
                                    <span className={`text-sm font-medium ${isFull ? 'text-red-600' : 'text-green-600'}`}>
                                      {shift.filled || 0}/{shift.capacity} volunteers
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{shift.description}</p>
                                  <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {shift.start_time} - {shift.end_time}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Modals */}
        {showEventModal && (
          <EventModal
            event={editingEvent}
            organizationId={currentOrganization.id}
            organizationLogoUrl={currentOrganization.logo_url}
            isPaid={orgPlan !== 'free'}
            onClose={() => setShowEventModal(false)}
            onSave={() => {
              setShowEventModal(false);
              fetchEvents();
            }}
            supabase={supabase}
          />
        )}

        <MessageComposer
          isOpen={!!messagingEvent}
          eventId={messagingEvent?.id}
          onClose={() => setMessagingEvent(null)}
        />

        {deletingEvent && (
          <ConfirmDeleteModal
            title="Delete Event"
            message={
              <>
                This will permanently delete <span className="font-medium text-gray-900 dark:text-gray-100">{deletingEvent.title}</span>, all its shifts, and all volunteer registrations. This cannot be undone.
              </>
            }
            confirmLabel="Delete Event"
            loading={deleting}
            onCancel={() => setDeletingEvent(null)}
            onConfirm={() => handleDeleteEvent(deletingEvent.id)}
          />
        )}

        {manageSeriesId && (
          <SeriesManagerModal
            seriesId={manageSeriesId}
            onClose={() => setManageSeriesId(null)}
            onChanged={fetchEvents}
          />
        )}

        {showShiftModal && selectedEventForShift && (
          <ShiftModal
            shift={editingShift}
            event={selectedEventForShift}
            onClose={() => setShowShiftModal(false)}
            onSave={() => {
              setShowShiftModal(false);
              fetchEvents();
            }}
            supabase={supabase}
          />
        )}
      </div>
    </>
  );
}

// Shift Modal Component
function ShiftModal({ shift, event, onClose, onSave, supabase }) {
  const nextShiftId = shift
    ? shift.shift_id
    : (Math.max(0, ...((event.shifts ?? []).map((s) => s.shift_id ?? 0))) + 1);

  const [formData, setFormData] = useState({
    shift_id: nextShiftId,
    name: shift?.name || '',
    description: shift?.description || '',
    start_time: shift?.start_time || '',
    end_time: shift?.end_time || '',
    capacity: shift?.capacity || 10
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.start_time) newErrors.start_time = 'Start time is required';
    if (!formData.end_time) newErrors.end_time = 'End time is required';
    if (formData.end_time <= formData.start_time) {
      newErrors.end_time = 'End time must be after start time';
    }
    if (formData.capacity < 1) newErrors.capacity = 'Capacity must be at least 1';
    if (shift && formData.capacity < shift.filled) {
      newErrors.capacity = `Cannot reduce below ${shift.filled} (current registrations)`;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (shift) {
        // Update
        const { error } = await supabase
          .from('shifts')
          .update(formData)
          .eq('id', shift.id);
        if (error) throw error;
      } else {
        // Create
        const { error } = await supabase
          .from('shifts')
          .insert({
            ...formData,
            event_id: event.id,
            filled: 0
          });
        if (error) throw error;
      }
      onSave();
    } catch (error) {
      alert('Error saving shift: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-lg w-full">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-6">{shift ? 'Edit Shift' : 'Create Shift'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Shift Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                placeholder="Morning Team"
              />
              {errors.name && <p className="text-red-600 text-sm mt-1">{errors.name}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Start Time</label>
                <input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                />
                {errors.start_time && <p className="text-red-600 text-sm mt-1">{errors.start_time}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">End Time</label>
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                />
                {errors.end_time && <p className="text-red-600 text-sm mt-1">{errors.end_time}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Volunteer Capacity</label>
              <input
                type="number"
                value={formData.capacity}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  setFormData({ ...formData, capacity: Number.isNaN(parsed) ? '' : parsed });
                }}
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                min={shift?.filled || 1}
              />
              {shift && (
                <p className="text-sm text-gray-500 mt-1">
                  Currently {shift.filled} volunteers registered
                </p>
              )}
              {errors.capacity && <p className="text-red-600 text-sm mt-1">{errors.capacity}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description (optional)</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                rows={2}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="flex-1 bg-gradient-to-br from-blue-600 to-purple-600 hover:opacity-90">
                {submitting ? 'Saving...' : shift ? 'Update Shift' : 'Create Shift'}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}