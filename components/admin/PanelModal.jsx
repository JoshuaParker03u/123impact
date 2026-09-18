'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import FloatingWindow from '@/components/FloatingWindow';
import ShiftDatePicker from './ShiftDatePicker';

export default function PanelModal({ panel, event, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name:           panel?.name           || '',
    description:    panel?.description    || '',
    start_time:     panel?.start_time     || '',
    end_time:       panel?.end_time       || '',
    capacity:       panel?.capacity       || 30,
    panel_date:     panel?.panel_date     || '',
    location:       panel?.location       || '',
    online_url:     panel?.online_url     || '',
    allow_waitlist: panel?.allow_waitlist ?? false,
  });
  const [errors, setErrors]       = useState({});
  const [submitting, setSubmitting] = useState(false);

  const isOvernight = formData.start_time && formData.end_time && formData.end_time <= formData.start_time;
  const isOnlineEvent = event.event_format === 'online' || event.event_format === 'hybrid';

  const validate = () => {
    const e = {};
    if (!formData.name.trim())                     e.name       = 'Name is required';
    if (!formData.start_time)                      e.start_time = 'Start time is required';
    if (!formData.end_time)                        e.end_time   = 'End time is required';
    if (formData.start_time === formData.end_time) e.end_time   = 'End time cannot equal start time';
    if (formData.capacity < 1)                     e.capacity   = 'Capacity must be at least 1';
    if (panel && formData.capacity < panel.filled) e.capacity   = `Cannot reduce below ${panel.filled} (current registrations)`;
    if (event.end_date && !formData.panel_date)    e.panel_date = 'Panel date is required for multi-day events';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload = { ...formData, panel_date: formData.panel_date || null };
      const url = panel ? `/api/panels/${panel.id}` : `/api/events/${event.id}/panels`;
      const res = await fetch(url, {
        method: panel ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save panel');
      onSave();
    } catch (err) {
      alert('Error saving panel: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FloatingWindow title={panel ? 'Edit Panel' : 'Create Panel'} onClose={onClose} maxWidthClassName="max-w-lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Panel Name</label>
              <input type="text" value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                placeholder="Future of Nonprofits" />
              {errors.name && <p className="text-red-600 text-sm mt-1">{errors.name}</p>}
            </div>

            {event.end_date && (
              <div>
                <label className="block text-sm font-medium mb-1">Panel Date</label>
                <ShiftDatePicker
                  value={formData.panel_date}
                  onChange={(d) => setFormData({ ...formData, panel_date: d })}
                  minDate={event.date}
                  maxDate={event.end_date}
                />
                {errors.panel_date && <p className="text-red-600 text-sm mt-1">{errors.panel_date}</p>}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Start Time</label>
                <input type="time" value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600" />
                {errors.start_time && <p className="text-red-600 text-sm mt-1">{errors.start_time}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Time</label>
                <input type="time" value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600" />
                {isOvernight && (
                  <p className="text-amber-600 dark:text-amber-400 text-xs mt-1 flex items-center gap-1">
                    <span>⚠</span> Ends next day (+1)
                  </p>
                )}
                {errors.end_time && <p className="text-red-600 text-sm mt-1">{errors.end_time}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Location (optional)</label>
              <input type="text" value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                placeholder="Room B, Main Hall" />
            </div>

            {isOnlineEvent && (
              <div>
                <label className="block text-sm font-medium mb-1">Online URL (Zoom, breakout room, etc.)</label>
                <input type="url" value={formData.online_url}
                  onChange={(e) => setFormData({ ...formData, online_url: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                  placeholder="https://zoom.us/j/..." />
                {!formData.online_url.trim() && (
                  <p className="text-amber-600 dark:text-amber-400 text-sm mt-1">
                    No link yet? That&apos;s fine — you can add it later, but attendees won&apos;t be able to join until you do.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Attendee Capacity</label>
              <input type="number" value={formData.capacity}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  setFormData({ ...formData, capacity: Number.isNaN(parsed) ? '' : parsed });
                }}
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                min={panel?.filled || 1} />
              {panel && <p className="text-sm text-gray-500 mt-1">Currently {panel.filled} attendees registered</p>}
              {errors.capacity && <p className="text-red-600 text-sm mt-1">{errors.capacity}</p>}
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={formData.allow_waitlist}
                onChange={(e) => setFormData({ ...formData, allow_waitlist: e.target.checked })}
                className="rounded"
              />
              Enable waitlist for this panel
            </label>

            <div>
              <label className="block text-sm font-medium mb-1">Description (optional)</label>
              <textarea value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                rows={2} />
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
              <Button type="submit" disabled={submitting} className="flex-1 bg-gradient-to-br from-blue-600 to-purple-600 hover:opacity-90">
                {submitting ? 'Saving...' : panel ? 'Update Panel' : 'Create Panel'}
              </Button>
            </div>
          </form>
    </FloatingWindow>
  );
}
