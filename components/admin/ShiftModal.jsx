'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import FloatingWindow from '@/components/FloatingWindow';
import ShiftDatePicker from './ShiftDatePicker';
import TimezoneShiftNotice from './TimezoneShiftNotice';
import { convertWallClock } from '@/lib/timezone-convert';

export default function ShiftModal({ shift, event, onClose, onSave, supabase, organizationTimezone = null, personalTimezone = null }) {
  const nextShiftId = shift
    ? shift.shift_id
    : (Math.max(0, ...((event.shifts ?? []).map((s) => s.shift_id ?? 0))) + 1);

  // Existing start/end times are stored as org-timezone wall-clock values --
  // convert them to the viewing admin's own personal timezone for display,
  // so re-saving an untouched field converts back to the exact original
  // (see lib/timezone-convert.ts's round-trip guarantee).
  const loadAnchorDate = shift?.shift_date || event.date;
  const loadedStart = shift?.start_time
    ? convertWallClock(loadAnchorDate, shift.start_time, organizationTimezone, personalTimezone)
    : null;
  const loadedEnd = shift?.end_time
    ? convertWallClock(loadAnchorDate, shift.end_time, organizationTimezone, personalTimezone)
    : null;

  const [formData, setFormData] = useState({
    shift_id:       nextShiftId,
    name:           shift?.name           || '',
    description:    shift?.description    || '',
    start_time:     loadedStart?.time ?? (shift?.start_time || ''),
    end_time:       loadedEnd?.time   ?? (shift?.end_time   || ''),
    capacity:       shift?.capacity       ?? 10,
    shift_date:     loadedStart?.date ?? shift?.shift_date ?? '',
    allow_waitlist: shift?.allow_waitlist ?? false,
  });
  const [errors, setErrors]       = useState({});
  const [submitting, setSubmitting] = useState(false);

  const isOvernight = formData.start_time && formData.end_time && formData.end_time <= formData.start_time;

  // Live preview of what saving right now would convert to in the org's
  // timezone -- lets the shift notice appear before the admin submits, not
  // just after. Only shift_date (the field this modal can actually move) is
  // eligible to shift; a single-day event has no shift_date field at all,
  // so there's nothing to move and the conversion is informational only.
  const saveAnchorDate = formData.shift_date || event.date;
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
    // A capacity of 0 is a deliberate "always full" setting (forces every
    // signup onto the waitlist), not an invalid one -- only negative/blank
    // values are rejected.
    if (formData.capacity === '' || formData.capacity < 0) e.capacity = 'Capacity is required';
    if (shift && formData.capacity < shift.filled) e.capacity   = `Cannot reduce below ${shift.filled} (current registrations)`;
    if (event.end_date && !formData.shift_date)    e.shift_date = 'Shift date is required for multi-day events';
    if (outOfRange) {
      e.shift_date = `This time converts to ${targetDate} in the organization's timezone, which is outside this event's dates (${event.date}–${event.end_date}). Adjust the time or shift date.`;
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
        shift_date: event.end_date ? (convertedDate || null) : null,
      };
      if (shift) {
        const { error } = await supabase.from('shifts').update(payload).eq('id', shift.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('shifts').insert({ ...payload, event_id: event.id, filled: 0 });
        if (error) throw error;
      }
      onSave();
    } catch (err) {
      alert('Error saving shift: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FloatingWindow title={shift ? 'Edit Shift' : 'Create Shift'} onClose={onClose} maxWidthClassName="max-w-lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Shift Name</label>
              <input type="text" value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                placeholder="Morning Team" />
              {errors.name && <p className="text-red-600 text-sm mt-1">{errors.name}</p>}
            </div>

            {event.end_date && (
              <div>
                <label className="block text-sm font-medium mb-1">Shift Date</label>
                <ShiftDatePicker
                  value={formData.shift_date}
                  onChange={(d) => setFormData({ ...formData, shift_date: d })}
                  minDate={event.date}
                  maxDate={event.end_date}
                />
                {errors.shift_date && <p className="text-red-600 text-sm mt-1">{errors.shift_date}</p>}
                {!outOfRange && (
                  <TimezoneShiftNotice originalDate={formData.shift_date} shiftedDate={targetDate} timezoneLabel={organizationTimezone || 'UTC'} />
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
              <label className="block text-sm font-medium mb-1">Volunteer Capacity</label>
              <input type="number" value={formData.capacity}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  setFormData({ ...formData, capacity: Number.isNaN(parsed) ? '' : parsed });
                }}
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                min={shift?.filled ?? 0} />
              {shift && <p className="text-sm text-gray-500 mt-1">Currently {shift.filled} volunteers registered</p>}
              {errors.capacity && <p className="text-red-600 text-sm mt-1">{errors.capacity}</p>}
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={formData.allow_waitlist}
                onChange={(e) => setFormData({ ...formData, allow_waitlist: e.target.checked })}
                className="rounded"
              />
              Enable waitlist for this shift
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
                {submitting ? 'Saving...' : shift ? 'Update Shift' : 'Create Shift'}
              </Button>
            </div>
          </form>
    </FloatingWindow>
  );
}
