'use client';

import { defaultShowtimeMessage } from '@/lib/discord/showtime-config';

// Repeatable list of Discord showtime reminder tiers (e.g. 60/30/0 minutes
// before showtime), shared by EventModal and PanelModal. Each row holds its
// own optional lead time and custom message; `reminders` entries keep
// lead_minutes as a string so the number input can be legitimately empty
// mid-edit without coercing to 0.
export default function ShowtimeReminderList({ reminders, onChange, name }) {
  function updateRow(index, patch) {
    onChange(reminders.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function removeRow(index) {
    onChange(reminders.filter((_, i) => i !== index));
  }
  function addRow() {
    onChange([...reminders, { lead_minutes: '', message: '' }]);
  }

  const values = reminders.map((r) => r.lead_minutes).filter((v) => v !== '');
  const duplicates = new Set(values.filter((v, i) => values.indexOf(v) !== i));

  return (
    <div className="space-y-2">
      {reminders.map((r, i) => {
        const leadNum = r.lead_minutes === '' ? null : parseInt(r.lead_minutes, 10);
        const isDuplicate = r.lead_minutes !== '' && duplicates.has(r.lead_minutes);
        return (
          <div key={i} className="flex items-start gap-2">
            <div className="w-28 shrink-0">
              <input
                type="number" min={0} max={1440} value={r.lead_minutes}
                onChange={(e) => updateRow(i, { lead_minutes: e.target.value })}
                className="w-full border rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                placeholder="Minutes"
              />
              {isDuplicate && <p className="text-red-600 text-xs mt-0.5">Duplicate</p>}
            </div>
            <input
              type="text" value={r.message}
              onChange={(e) => updateRow(i, { message: e.target.value })}
              className="flex-1 border rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
              placeholder={leadNum !== null ? `Default: "${defaultShowtimeMessage(leadNum, name || 'This event')}"` : 'Custom message (optional)'}
            />
            <button type="button" onClick={() => removeRow(i)} className="text-xs text-red-600 dark:text-red-400 hover:underline shrink-0 mt-2">
              Remove
            </button>
          </div>
        );
      })}
      <button type="button" onClick={addRow} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
        + Add another reminder
      </button>
    </div>
  );
}
