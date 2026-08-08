'use client';

import { useState } from 'react';
import { X, Loader2, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import ShiftDatePicker from './ShiftDatePicker';
import { countOccurrences, describeMonthlyPattern, MAX_OCCURRENCES } from '@/lib/recurrence';

// Triggered from the event management page, after shifts/day-hours have
// already been set up — generation copies whatever the event currently
// has, so this deliberately isn't offered at event-creation time (shifts
// are added in a separate step afterward and would otherwise be copied
// as empty).
export default function SetRecurringModal({ event, onClose, onDone }) {
  const [frequency, setFrequency] = useState('weekly');
  const [endDate, setEndDate]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');

  const occurrenceCount = endDate && endDate > event.date
    ? countOccurrences(event.date, endDate, frequency)
    : 0;

  const handleSubmit = async () => {
    if (!endDate || endDate <= event.date) {
      setError('Pick an end date after the event date');
      return;
    }
    setSubmitting(true);
    setError('');
    const res = await fetch(`/api/events/${event.id}/recur`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frequency, end_date: endDate }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? 'Failed to set up recurrence');
      return;
    }
    onDone(data);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Repeat className="w-5 h-5 text-indigo-600" /> Set as Recurring
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Creates additional copies of this event — including its current shifts and daily schedule — on a repeating basis.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Frequency</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
            </select>
            {frequency === 'monthly' && (
              <p className="text-xs text-gray-400 mt-1">
                Repeats on {describeMonthlyPattern(event.date)} of each month.
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Repeat until</label>
            <ShiftDatePicker value={endDate} onChange={setEndDate} minDate={event.date} />
          </div>
          {occurrenceCount > 0 && (
            <p className="text-xs text-gray-400">
              This will create {occurrenceCount} event{occurrenceCount === 1 ? '' : 's'}
              {occurrenceCount >= MAX_OCCURRENCES ? ` (capped at ${MAX_OCCURRENCES})` : ''}, each with the same shifts and schedule.
            </p>
          )}
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
        <div className="flex gap-3 pt-5">
          <Button variant="outline" onClick={onClose} disabled={submitting} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 bg-gradient-to-br from-blue-600 to-purple-600 hover:opacity-90"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Series'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
