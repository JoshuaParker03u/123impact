'use client';

import { useState, useRef, useEffect } from 'react';
import { Clock } from 'lucide-react';

const SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

function to12h(hhmm) {
  if (!hhmm) return '';
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${period}`;
}

// Parse free-form input like "9am", "9:30", "9:30am", "14:00", "2 pm" → "HH:MM" or null
function parseTimeInput(str) {
  if (!str) return null;
  const s = str.trim().toLowerCase().replace(/\s+/g, '');
  const match = s.match(/^(\d{1,2})(?::(\d{2}))?(?:(am|pm))?$/);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3];
  if (h > 23 || m > 59) return null;
  if (period === 'am') { if (h === 12) h = 0; }
  else if (period === 'pm') { if (h !== 12) h += 12; if (h > 23) return null; }
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export default function ShiftTimePicker({ value, onChange, placeholder = 'Select time' }) {
  const [open, setOpen]       = useState(false);
  const [inputVal, setInputVal] = useState(() => (value ? to12h(value) : ''));
  const [invalid, setInvalid]   = useState(false);
  const containerRef            = useRef(null);
  const inputRef                = useRef(null);
  const listRef                 = useRef(null);

  // Keep display in sync when value changes externally (e.g. slot click)
  useEffect(() => {
    setInputVal(value ? to12h(value) : '');
    setInvalid(false);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // Scroll selected slot into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const sel = listRef.current.querySelector('[data-selected="true"]');
    if (sel) { sel.scrollIntoView({ block: 'center' }); return; }
    const eighth = listRef.current.querySelector('[data-slot="08:00"]');
    if (eighth) eighth.scrollIntoView({ block: 'start' });
  }, [open]);

  function handleInputChange(e) {
    const raw = e.target.value;
    setInputVal(raw);
    const parsed = parseTimeInput(raw);
    if (parsed) {
      onChange(parsed);
      setInvalid(false);
    } else if (raw === '') {
      onChange('');
      setInvalid(false);
    }
  }

  function handleBlur() {
    if (inputVal === '') { setInvalid(false); return; }
    const parsed = parseTimeInput(inputVal);
    if (parsed) {
      setInputVal(to12h(parsed));
      setInvalid(false);
    } else {
      setInvalid(true);
    }
  }

  function selectSlot(slot) {
    onChange(slot);
    setInputVal(to12h(slot));
    setInvalid(false);
    setOpen(false);
    inputRef.current?.blur();
  }

  return (
    <div ref={containerRef} className="relative">
      <div className={`flex items-center gap-2 border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-sm transition-colors ${
        invalid
          ? 'border-red-400 dark:border-red-500'
          : open
            ? 'border-blue-400 dark:border-blue-500'
            : 'border-gray-300 dark:border-gray-600'
      }`}>
        <Clock className="w-4 h-4 text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 min-w-0"
        />
      </div>
      {invalid && (
        <p className="text-red-500 text-xs mt-0.5">Use a format like "9am", "9:30", or "14:00"</p>
      )}

      {open && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-36 max-h-52 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 shadow-lg py-1"
        >
          {SLOTS.map((slot) => {
            const isSelected = slot === value;
            return (
              <button
                key={slot}
                type="button"
                data-slot={slot}
                data-selected={isSelected}
                onMouseDown={(e) => { e.preventDefault(); selectSlot(slot); }}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {to12h(slot)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
