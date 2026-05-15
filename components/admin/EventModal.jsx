'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import ShiftDatePicker from './ShiftDatePicker';

function generateSlug(title, suffix) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
  return base ? `${base}-${suffix}` : '';
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 6);
}

function getEventDays(start, end) {
  if (!start) return [];
  const days = [];
  const cur = new Date(start + 'T00:00:00');
  const last = new Date((end || start) + 'T00:00:00');
  while (cur <= last) {
    days.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

const inputCls = 'w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600';
const timeInputCls = 'border rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600';

export default function EventModal({ event, organizationId, onClose, onSave, supabase, isPaid = false }) {
  const [slugSuffix] = useState(() => randomSuffix());
  const [slugEdited, setSlugEdited] = useState(false);
  const [formData, setFormData] = useState({
    event_id:      event?.event_id      || '',
    title:         event?.title         || '',
    date:          event?.date          || '',
    end_date:      event?.end_date      || '',
    time:          event?.time          || '',
    location:      event?.location      || '',
    description:   event?.description   || '',
    image_url:     event?.image_url     || '',
    status:        event?.status        || 'active',
    event_format:  event?.event_format  || 'in_person',
    online_url:    event?.online_url    || '',
    recording_url: event?.recording_url || '',
  });
  const [isMultiDay, setIsMultiDay] = useState(!!event?.end_date);
  const [dayHours, setDayHours] = useState(() =>
    (event?.event_day_hours ?? []).reduce((acc, r) => {
      acc[r.event_date] = { start_time: r.start_time, end_time: r.end_time };
      return acc;
    }, {})
  );
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const hasVolunteers = !!event && (event.shifts ?? []).reduce((sum, s) => sum + (s.filled ?? 0), 0) > 0;

  const handleTitleChange = (value) => {
    const updates = { title: value };
    if (!event && !slugEdited) {
      updates.event_id = generateSlug(value, slugSuffix);
    }
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.title.trim()) newErrors.title = 'Title is required';
    if (!formData.date) newErrors.date = 'Date is required';
    if (formData.end_date && formData.end_date < formData.date) newErrors.end_date = 'End date must be on or after start date';
    if (!formData.location.trim()) newErrors.location = 'Location is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const saveDayHours = async (eventId) => {
    const days = getEventDays(formData.date, formData.end_date || formData.date);
    const rows = days
      .filter(d => dayHours[d]?.start_time && dayHours[d]?.end_time)
      .map(d => ({ event_id: eventId, event_date: d, start_time: dayHours[d].start_time, end_time: dayHours[d].end_time }));

    if (rows.length > 0) {
      await supabase.from('event_day_hours').upsert(rows, { onConflict: 'event_id,event_date' });
    }
    // Remove rows for days no longer in range
    if (days.length > 0) {
      await supabase.from('event_day_hours').delete().eq('event_id', eventId)
        .not('event_date', 'in', `(${days.map(d => `"${d}"`).join(',')})`);
    } else {
      await supabase.from('event_day_hours').delete().eq('event_id', eventId);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (event) {
        const { error } = await supabase
          .from('events')
          .update({ ...formData, end_date: formData.end_date || null })
          .eq('id', event.id);
        if (error) throw error;
        await saveDayHours(event.id);
      } else {
        const { data: newEvent, error } = await supabase
          .from('events')
          .insert({
            event_id:      formData.event_id,
            title:         formData.title,
            date:          formData.date,
            end_date:      formData.end_date || null,
            time:          formData.time || '',
            location:      formData.location,
            description:   formData.description,
            image_url:     formData.image_url,
            status:        formData.status,
            event_format:  formData.event_format,
            online_url:    formData.online_url || null,
            recording_url: formData.recording_url || null,
            organization_id: organizationId,
          })
          .select('id')
          .single();
        if (error) throw error;
        await saveDayHours(newEvent.id);
      }
      onSave();
    } catch (error) {
      alert('Error saving event: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const scheduleDays = getEventDays(formData.date, isMultiDay ? formData.end_date : formData.date);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-6">{event ? 'Edit Event' : 'Create Event'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {event && (
              <div>
                <label className="block text-sm font-medium mb-1">Event ID (URL slug)</label>
                <input
                  type="text"
                  value={formData.event_id}
                  className="w-full border rounded-md px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 cursor-not-allowed"
                  disabled
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className={inputCls}
              />
              {errors.title && <p className="text-red-600 text-sm mt-1">{errors.title}</p>}
            </div>

            <div>
              <div>
                <label className="block text-sm font-medium mb-1">Date</label>
                <ShiftDatePicker
                  value={formData.date}
                  onChange={(d) => setFormData({ ...formData, date: d })}
                  disabled={hasVolunteers}
                />
                {hasVolunteers
                  ? <p className="text-xs text-gray-400 mt-1">Date cannot be changed — volunteers are registered</p>
                  : errors.date && <p className="text-red-600 text-sm mt-1">{errors.date}</p>
                }
                <div className="mt-2">
                  {isPaid ? (
                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none text-gray-600 dark:text-gray-400">
                      <input
                        type="checkbox"
                        checked={isMultiDay}
                        disabled={hasVolunteers}
                        onChange={(e) => {
                          setIsMultiDay(e.target.checked);
                          if (e.target.checked && formData.date) {
                            const next = new Date(formData.date + 'T00:00:00');
                            next.setDate(next.getDate() + 1);
                            setFormData(prev => ({ ...prev, end_date: next.toISOString().split('T')[0] }));
                          } else if (!e.target.checked) {
                            setFormData(prev => ({
                              ...prev,
                              end_date: '',
                              status: prev.status === 'ongoing' ? 'active' : prev.status,
                            }));
                          }
                        }}
                        className="rounded"
                      />
                      Multi-day event
                    </label>
                  ) : (
                    <p className="text-xs text-gray-400">Multi-day events require a paid plan</p>
                  )}
                  {isPaid && isMultiDay && (
                    <div className="mt-2">
                      <label className="block text-sm font-medium mb-1">End Date</label>
                      <ShiftDatePicker
                        value={formData.end_date}
                        onChange={(d) => setFormData({ ...formData, end_date: d })}
                        minDate={formData.date ? (() => { const d = new Date(formData.date + 'T00:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })() : undefined}
                        disabled={hasVolunteers}
                      />
                      {errors.end_date && <p className="text-red-600 text-sm mt-1">{errors.end_date}</p>}
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Event Hours / Daily Schedule */}
            {scheduleDays.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  {isMultiDay ? 'Daily Schedule (optional)' : 'Event Hours (optional)'}
                </label>
                <div className="space-y-2">
                  {scheduleDays.map(day => {
                    const d = new Date(day + 'T00:00:00');
                    const label = isMultiDay
                      ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
                      : null;
                    return (
                      <div key={day} className="flex items-center gap-3">
                        {label && (
                          <span className="text-sm text-gray-600 dark:text-gray-400 w-28 shrink-0">{label}</span>
                        )}
                        <div className="flex items-center gap-2 flex-1">
                          <div className="flex-1">
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Opens</label>
                            <input
                              type="time"
                              value={dayHours[day]?.start_time || ''}
                              onChange={(e) => setDayHours(prev => ({ ...prev, [day]: { ...prev[day], start_time: e.target.value } }))}
                              className={timeInputCls + ' w-full'}
                            />
                          </div>
                          <span className="text-gray-400 mt-4">–</span>
                          <div className="flex-1">
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Closes</label>
                            <input
                              type="time"
                              value={dayHours[day]?.end_time || ''}
                              onChange={(e) => setDayHours(prev => ({ ...prev, [day]: { ...prev[day], end_time: e.target.value } }))}
                              className={timeInputCls + ' w-full'}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Location</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className={inputCls}
              />
              {errors.location && <p className="text-red-600 text-sm mt-1">{errors.location}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Event Format</label>
              <div className="flex gap-2">
                {[['in_person', 'In Person'], ['online', 'Online'], ['hybrid', 'Hybrid']].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setFormData({ ...formData, event_format: val })}
                    className={`flex-1 py-2 rounded-md text-sm font-medium border transition-colors ${
                      formData.event_format === val
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {(formData.event_format === 'online' || formData.event_format === 'hybrid') && (
              <div>
                <label className="block text-sm font-medium mb-1">Online URL (Zoom, livestream, etc.)</label>
                <input
                  type="url"
                  value={formData.online_url}
                  onChange={(e) => setFormData({ ...formData, online_url: e.target.value })}
                  className={inputCls}
                  placeholder="https://zoom.us/j/..."
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Description (optional)</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className={inputCls}
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Image URL (optional)</label>
              <input
                type="text"
                value={formData.image_url}
                onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                className={inputCls}
                placeholder="https://..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Recording URL (optional — add after the event)</label>
              <input
                type="url"
                value={formData.recording_url}
                onChange={(e) => setFormData({ ...formData, recording_url: e.target.value })}
                className={inputCls}
                placeholder="https://youtube.com/watch?v=..."
              />
            </div>

            {event && (
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className={inputCls}
                >
                  <option value="active">Active</option>
                  {isMultiDay && <option value="ongoing">Ongoing</option>}
                  <option value="cancelled">Cancelled</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="flex-1 bg-gradient-to-br from-blue-600 to-purple-600 hover:opacity-90">
                {submitting ? 'Saving...' : event ? 'Update Event' : 'Create Event'}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
