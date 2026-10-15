'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import FloatingWindow from '@/components/FloatingWindow';
import ShiftDatePicker from './ShiftDatePicker';
import TimezoneShiftNotice from './TimezoneShiftNotice';
import { convertWallClock } from '@/lib/timezone-convert';

export default function PanelModal({ panel, event, onClose, onSave, organizationTimezone = null, personalTimezone = null }) {
  // Existing start/end times are stored as org-timezone wall-clock values --
  // convert them to the viewing admin's own personal timezone for display,
  // so re-saving an untouched field converts back to the exact original.
  const loadAnchorDate = panel?.panel_date || event.date;
  const loadedStart = panel?.start_time
    ? convertWallClock(loadAnchorDate, panel.start_time, organizationTimezone, personalTimezone)
    : null;
  const loadedEnd = panel?.end_time
    ? convertWallClock(loadAnchorDate, panel.end_time, organizationTimezone, personalTimezone)
    : null;

  const [formData, setFormData] = useState({
    name:           panel?.name           || '',
    description:    panel?.description    || '',
    start_time:     loadedStart?.time ?? (panel?.start_time || ''),
    end_time:       loadedEnd?.time   ?? (panel?.end_time   || ''),
    capacity:       panel ? (panel.capacity ?? '') : '',
    panel_date:     loadedStart?.date ?? panel?.panel_date ?? '',
    location:       panel?.location     || '',
    online_url:     panel?.online_url     || '',
    allow_waitlist: panel?.allow_waitlist ?? false,
    discord_showtime_webhook_url:  panel?.discord_showtime_webhook_url  || '',
    discord_showtime_message:      panel?.discord_showtime_message      || '',
    discord_showtime_lead_minutes: panel?.discord_showtime_lead_minutes ?? '',
  });
  const [errors, setErrors]       = useState({});
  const [submitting, setSubmitting] = useState(false);

  const isOvernight = formData.start_time && formData.end_time && formData.end_time <= formData.start_time;
  const isOnlineEvent = event.event_format === 'online' || event.event_format === 'hybrid';

  // Live preview of what saving right now would convert to in the org's
  // timezone -- lets the shift notice appear before the admin submits.
  const saveAnchorDate = formData.panel_date || event.date;
  const targetStart = formData.start_time
    ? convertWallClock(saveAnchorDate, formData.start_time, personalTimezone, organizationTimezone)
    : null;
  const targetDate = event.end_date ? (targetStart?.date ?? saveAnchorDate) : saveAnchorDate;
  const outOfRange = !!(event.end_date && targetStart && (targetDate < event.date || targetDate > event.end_date));

  const validate = () => {
    const e = {};
    if (!formData.name.trim())                     e.name       = 'Name is required';
    if (!formData.start_time)                      e.start_time = 'Start time is required';
    if (!formData.end_time)                        e.end_time   = 'End time is required';
    if (formData.start_time === formData.end_time) e.end_time   = 'End time cannot equal start time';
    if (formData.capacity !== '' && formData.capacity < 1) e.capacity = 'Capacity must be at least 1 (or blank for unlimited)';
    if (panel && formData.capacity !== '' && formData.capacity < panel.filled) {
      e.capacity = `Cannot reduce below ${panel.filled} (current registrations)`;
    }
    if (event.end_date && !formData.panel_date)    e.panel_date = 'Panel date is required for multi-day events';
    if (outOfRange) {
      e.panel_date = `This time converts to ${targetDate} in the organization's timezone, which is outside this event's dates (${event.date}–${event.end_date}). Adjust the time or panel date.`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const startConv = convertWallClock(saveAnchorDate, formData.start_time, personalTimezone, organizationTimezone);
      const endConv   = convertWallClock(saveAnchorDate, formData.end_time,   personalTimezone, organizationTimezone);
      const convertedDate = event.end_date ? (startConv?.date ?? saveAnchorDate) : null;

      const payload = {
        ...formData,
        start_time: startConv?.time ?? formData.start_time,
        end_time:   endConv?.time   ?? formData.end_time,
        panel_date: event.end_date ? (convertedDate || null) : null,
        capacity:   formData.capacity === '' ? null : formData.capacity,
        discord_showtime_webhook_url:  formData.discord_showtime_webhook_url.trim() || null,
        discord_showtime_message:      formData.discord_showtime_message.trim() || null,
        discord_showtime_lead_minutes: formData.discord_showtime_lead_minutes === '' ? null : parseInt(formData.discord_showtime_lead_minutes, 10),
      };
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
                {!outOfRange && (
                  <TimezoneShiftNotice originalDate={formData.panel_date} shiftedDate={targetDate} timezoneLabel={organizationTimezone || 'UTC'} />
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Start Time</label>
                <input type="time" value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600" />
                {!event.end_date && (
                  <TimezoneShiftNotice originalDate={event.date} shiftedDate={targetDate} timezoneLabel={organizationTimezone || 'UTC'} />
                )}
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
                  const raw = e.target.value;
                  if (raw === '') { setFormData({ ...formData, capacity: '' }); return; }
                  const parsed = parseInt(raw, 10);
                  setFormData({ ...formData, capacity: Number.isNaN(parsed) ? '' : parsed });
                }}
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                placeholder="Unlimited"
                min={panel?.filled || 1} />
              <p className="text-sm text-gray-500 mt-1">
                Leave blank for unlimited capacity.{panel ? ` Currently ${panel.filled} attendees registered.` : ''}
              </p>
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

            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium">Discord Showtime Ping (optional)</p>
              <p className="text-xs text-gray-500">
                Leave blank to use the event&apos;s Discord showtime settings. Set a webhook here only if this
                panel should ping a different channel.
              </p>
              <input type="url" value={formData.discord_showtime_webhook_url}
                onChange={(e) => setFormData({ ...formData, discord_showtime_webhook_url: e.target.value })}
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                placeholder="https://discord.com/api/webhooks/..." />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs mb-1">Minutes before showtime</label>
                  <input type="number" min={1} max={1440} value={formData.discord_showtime_lead_minutes}
                    onChange={(e) => setFormData({ ...formData, discord_showtime_lead_minutes: e.target.value })}
                    className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                    placeholder="Inherit from event" />
                </div>
              </div>
              <textarea rows={2} value={formData.discord_showtime_message}
                onChange={(e) => setFormData({ ...formData, discord_showtime_message: e.target.value })}
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                placeholder="Leave blank to use the event's message" />
            </div>

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
