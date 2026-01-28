'use client';

import { useState, useEffect } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { createBrowserClient } from '@supabase/ssr';
import AdminNavigation from '@/components/admin/AdminNavigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Calendar, MapPin, Users, Clock, Plus, Edit, Trash2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

export default function AdminEventsPage() {
  const { currentOrganization, loading: orgLoading } = useOrganization();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedEvent, setExpandedEvent] = useState(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [editingShift, setEditingShift] = useState(null);
  const [selectedEventForShift, setSelectedEventForShift] = useState(null);
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // Fetch events when organization changes
  useEffect(() => {
    if (currentOrganization) {
      fetchEvents();
    }
  }, [currentOrganization]);

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
          filled
        )
      `)
      .eq('organization_id', currentOrganization.id)
      .order('date', { ascending: true });

    if (error) {
      console.error('Error fetching events:', error);
    } else {
      setEvents(data || []);
    }
    setLoading(false);
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
    if (!confirm('This will delete the event and all its shifts. Continue?')) return;

    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', eventId);

    if (error) {
      alert('Error deleting event: ' + error.message);
    } else {
      fetchEvents();
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
    if (filled > 0) {
      if (!confirm(`${filled} volunteers are registered. Continue?`)) return;
    }

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
        <div className="max-w-7xl mx-auto px-4 py-8">
          <Card className="p-8 text-center">
            <p className="text-gray-600">No organization selected</p>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <AdminNavigation />
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Events</h1>
          <Button onClick={handleCreateEvent} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Create Event
          </Button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        )}

        {/* Empty State */}
        {!loading && events.length === 0 && (
          <Card className="p-12 text-center">
            <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No events yet</h2>
            <p className="text-gray-600 mb-6">Create your first event to get started</p>
            <Button onClick={handleCreateEvent} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Create Event
            </Button>
          </Card>
        )}

        {/* Events List */}
        {!loading && events.length > 0 && (
          <div className="space-y-4">
            {events.map((event) => {
              const isExpanded = expandedEvent === event.id;
              const totalVolunteers = event.shifts?.reduce((sum, shift) => sum + (shift.filled || 0), 0) || 0;
              const totalCapacity = event.shifts?.reduce((sum, shift) => sum + shift.capacity, 0) || 0;

              return (
                <Card key={event.id} className="overflow-hidden">
                  {/* Event Header */}
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">{event.title}</h2>
                        <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-3">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {event.date}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {event.time}
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
                          <p className="text-gray-700">{event.description}</p>
                        )}
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditEvent(event)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteEvent(event.id)}
                          className="text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Shifts Toggle */}
                    <div className="flex items-center justify-between pt-4 border-t">
                      <button
                        onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                        className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        {event.shifts?.length || 0} Shifts
                      </button>
                      <Button
                        size="sm"
                        onClick={() => handleAddShift(event)}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Shift
                      </Button>
                    </div>
                  </div>

                  {/* Shifts List (Collapsible) */}
                  {isExpanded && (
                    <div className="border-t bg-gray-50 p-6">
                      {!event.shifts || event.shifts.length === 0 ? (
                        <p className="text-gray-600 text-center py-4">No shifts yet. Add one to get started!</p>
                      ) : (
                        <div className="space-y-3">
                          {event.shifts.map((shift) => {
                            const spotsLeft = shift.capacity - (shift.filled || 0);
                            const isFull = spotsLeft <= 0;

                            return (
                              <div
                                key={shift.id}
                                className="bg-white rounded-lg p-4 flex justify-between items-center"
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-1">
                                    <h3 className="font-semibold text-gray-900">{shift.name}</h3>
                                    <span className={`text-sm font-medium ${isFull ? 'text-red-600' : 'text-green-600'}`}>
                                      {shift.filled || 0}/{shift.capacity} volunteers
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-600 mb-2">{shift.description}</p>
                                  <div className="flex items-center gap-4 text-sm text-gray-500">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {shift.start_time} - {shift.end_time}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex gap-2 ml-4">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEditShift(shift, event)}
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeleteShift(shift.id, shift.filled)}
                                    className="text-red-600 hover:bg-red-50"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
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
            onClose={() => setShowEventModal(false)}
            onSave={() => {
              setShowEventModal(false);
              fetchEvents();
            }}
            supabase={supabase}
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

// Event Modal Component
function EventModal({ event, organizationId, onClose, onSave, supabase }) {
  const [formData, setFormData] = useState({
    event_id: event?.event_id || '',
    title: event?.title || '',
    date: event?.date || '',
    time: event?.time || '',
    location: event?.location || '',
    description: event?.description || '',
    image_url: event?.image_url || '',
    status: event?.status || 'active'
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const newErrors = {};
    if (!formData.event_id.trim()) newErrors.event_id = 'Event ID is required';
    if (!formData.title.trim()) newErrors.title = 'Title is required';
    if (!formData.date) newErrors.date = 'Date is required';
    if (!formData.time.trim()) newErrors.time = 'Time is required';
    if (!formData.location.trim()) newErrors.location = 'Location is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (event) {
        // Update
        const { error } = await supabase
          .from('events')
          .update(formData)
          .eq('id', event.id);
        if (error) throw error;
      } else {
        // Create
        const { error } = await supabase
          .from('events')
          .insert({
            ...formData,
            organization_id: organizationId
          });
        if (error) throw error;
      }
      onSave();
    } catch (error) {
      alert('Error saving event: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-6">{event ? 'Edit Event' : 'Create Event'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Event ID (URL slug)</label>
              <input
                type="text"
                value={formData.event_id}
                onChange={(e) => setFormData({ ...formData, event_id: e.target.value })}
                className="w-full border rounded-md px-3 py-2"
                placeholder="spring-cleanup-2025"
                disabled={!!event} // Can't change ID after creation
              />
              {errors.event_id && <p className="text-red-600 text-sm mt-1">{errors.event_id}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full border rounded-md px-3 py-2"
              />
              {errors.title && <p className="text-red-600 text-sm mt-1">{errors.title}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Date</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full border rounded-md px-3 py-2"
                />
                {errors.date && <p className="text-red-600 text-sm mt-1">{errors.date}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Time</label>
                <input
                  type="text"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  className="w-full border rounded-md px-3 py-2"
                  placeholder="9:00 AM - 3:00 PM"
                />
                {errors.time && <p className="text-red-600 text-sm mt-1">{errors.time}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Location</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full border rounded-md px-3 py-2"
              />
              {errors.location && <p className="text-red-600 text-sm mt-1">{errors.location}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description (optional)</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full border rounded-md px-3 py-2"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Image URL (optional)</label>
              <input
                type="text"
                value={formData.image_url}
                onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                className="w-full border rounded-md px-3 py-2"
                placeholder="https://..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full border rounded-md px-3 py-2"
              >
                <option value="active">Active</option>
                <option value="cancelled">Cancelled</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="flex-1 bg-blue-600 hover:bg-blue-700">
                {submitting ? 'Saving...' : event ? 'Update Event' : 'Create Event'}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}

// Shift Modal Component
function ShiftModal({ shift, event, onClose, onSave, supabase }) {
  const [formData, setFormData] = useState({
    shift_id: shift?.shift_id || '',
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
    if (!formData.shift_id) newErrors.shift_id = 'Shift number is required';
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
              <label className="block text-sm font-medium mb-1">Shift Number</label>
              <input
                type="number"
                value={formData.shift_id}
                onChange={(e) => setFormData({ ...formData, shift_id: parseInt(e.target.value) })}
                className="w-full border rounded-md px-3 py-2"
                min="1"
              />
              {errors.shift_id && <p className="text-red-600 text-sm mt-1">{errors.shift_id}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Shift Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full border rounded-md px-3 py-2"
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
                  className="w-full border rounded-md px-3 py-2"
                />
                {errors.start_time && <p className="text-red-600 text-sm mt-1">{errors.start_time}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">End Time</label>
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  className="w-full border rounded-md px-3 py-2"
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
                className="w-full border rounded-md px-3 py-2"
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
                className="w-full border rounded-md px-3 py-2"
                rows={2}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="flex-1 bg-blue-600 hover:bg-blue-700">
                {submitting ? 'Saving...' : shift ? 'Update Shift' : 'Create Shift'}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}