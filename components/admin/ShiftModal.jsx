'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import ShiftDatePicker from './ShiftDatePicker';
import { X } from 'lucide-react';

export default function ShiftModal({ shift, event, onClose, onSave, supabase }) {
  const nextShiftId = shift
    ? shift.shift_id
    : (Math.max(0, ...((event.shifts ?? []).map((s) => s.shift_id ?? 0))) + 1);

  const [formData, setFormData] = useState({
    shift_id:       nextShiftId,
    name:           shift?.name           || '',
    description:    shift?.description    || '',
    start_time:     shift?.start_time     || '',
    end_time:       shift?.end_time       || '',
    capacity:       shift?.capacity       || 10,
    shift_date:     shift?.shift_date     || '',
    allow_waitlist: shift?.allow_waitlist ?? false,
  });
  const [errors, setErrors]       = useState({});
  const [submitting, setSubmitting] = useState(false);

  const isOvernight = formData.start_time && formData.end_time && formData.end_time <= formData.start_time;

  const validate = () => {
    const e = {};
    if (!formData.name.trim())                     e.name       = 'Name is required';
    if (!formData.start_time)                      e.start_time = 'Start time is required';
    if (!formData.end_time)                        e.end_time   = 'End time is required';
    if (formData.start_time === formData.end_time) e.end_time   = 'End time cannot equal start time';
    if (formData.capacity < 1)                     e.capacity   = 'Capacity must be at least 1';
    if (shift && formData.capacity < shift.filled) e.capacity   = `Cannot reduce below ${shift.filled} (current registrations)`;
    if (event.end_date && !formData.shift_date)    e.shift_date = 'Shift date is required for multi-day events';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload = { ...formData, shift_date: formData.shift_date || null };
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-lg w-full">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">{shift ? 'Edit Shift' : 'Create Shift'}</h2>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X className="w-6 h-6" />
            </button>
          </div>
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
              <label className="block text-sm font-medium mb-1">Volunteer Capacity</label>
              <input type="number" value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                min={shift?.filled || 1} />
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
        </div>
      </Card>
    </div>
  );
}
