'use client';

import { useState, useEffect } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { getBrowserClient } from '@/lib/supabase';
import AdminNavigation from '@/components/admin/AdminNavigation';
import EventModal from '@/components/admin/EventModal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Calendar, MapPin, Users, Clock, Plus, Edit, Trash2, ChevronDown, ChevronUp, Loader2, Search, Link2, Check, QrCode, Download, X, ArrowRight } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Link from 'next/link';

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
  const [copiedEventId, setCopiedEventId] = useState(null);
  const [qrEvent, setQrEvent] = useState(null);
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
        )
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
        .select('shift_id')
        .in('shift_id', allShiftIds);
      countMap = (regRows || []).reduce((acc, r) => {
        acc[r.shift_id] = (acc[r.shift_id] ?? 0) + 1;
        return acc;
      }, {});
    }

    const enriched = (data || []).map(event => ({
      ...event,
      shifts: (event.shifts || []).map(shift => ({
        ...shift,
        filled: countMap[shift.id] ?? 0,
      })),
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
    if (!confirm('This will delete the event, all its shifts, and all volunteer registrations. Continue?')) return;

    const res = await fetch(`/api/events/${eventId}`, { method: 'DELETE' });
    const data = await res.json();

    if (!res.ok) {
      alert('Error deleting event: ' + (data.error ?? 'Unknown error'));
    } else {
      fetchEvents();
    }
  };

  const copyEventLink = (event) => {
    const url = `${window.location.origin}/events/${event.event_id}/signup`;
    navigator.clipboard.writeText(url);
    setCopiedEventId(event.id);
    setTimeout(() => setCopiedEventId(null), 2000);
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
        <AdminNavigation />
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </>
    );
  }

  if (!currentOrganization) {
    return (
      <>
        <AdminNavigation />
        <div className="container mx-auto px-4 py-8">
          <Card className="p-8 text-center">
            <p className="text-gray-600">No organization selected</p>
          </Card>
        </div>
      </>
    );
  }

  const STATUS_ORDER = { ongoing: 0, active: 1, completed: 2, cancelled: 3 };

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
    ongoing:   'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    completed: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  };

  return (
    <>
      <AdminNavigation />
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
              const totalCapacity = event.shifts?.reduce((sum, shift) => sum + shift.capacity, 0) || 0;

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
                          </span>
                        </div>
                        {event.description && (
                          <p className="text-gray-700 dark:text-gray-300">{event.description}</p>
                        )}
                      </div>
                      <div className="flex gap-2 mt-3 sm:mt-0 sm:ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyEventLink(event)}
                          title="Copy signup link"
                        >
                          {copiedEventId === event.id
                            ? <Check className="w-4 h-4 text-green-600" />
                            : <Link2 className="w-4 h-4" />}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setQrEvent(event)}
                          title="Show QR code"
                        >
                          <QrCode className="w-4 h-4" />
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditEvent(event)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Shifts Toggle */}
                    <div className="flex items-center justify-between pt-4 border-t dark:border-gray-700">
                      <button
                        onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                        className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        {event.shifts?.length || 0} Shifts
                      </button>
                      <Link
                        href={`/admin/events/${event.event_id}`}
                        className="flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Manage <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>

                  {/* Shifts List (Collapsible) */}
                  {isExpanded && (
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
            isPaid={orgPlan !== 'free'}
            onClose={() => setShowEventModal(false)}
            onSave={() => {
              setShowEventModal(false);
              fetchEvents();
            }}
            supabase={supabase}
          />
        )}

        {qrEvent && (
          <QRModal
            event={qrEvent}
            onClose={() => setQrEvent(null)}
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

// QR Code Modal
function QRModal({ event, onClose }) {
  const url = `${window.location.origin}/events/${event.event_id}/signup`;

  const downloadQR = () => {
    const svg = document.getElementById('event-qr-svg');
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 300, 300);
      ctx.drawImage(img, 0, 0, 300, 300);
      const a = document.createElement('a');
      a.download = `${event.event_id}-qr.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="p-6 w-full max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{event.title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex justify-center mb-4 bg-white p-4 rounded-lg">
          <QRCodeSVG id="event-qr-svg" value={url} size={220} />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 break-all">{url}</p>
        <Button onClick={downloadQR} variant="outline" className="w-full">
          <Download className="w-4 h-4 mr-2" />
          Download PNG
        </Button>
      </Card>
    </div>
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
                onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
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