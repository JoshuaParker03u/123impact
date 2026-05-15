'use client';

import { useState, useRef, useEffect } from 'react';
import {
  startOfMonth, endOfMonth, eachDayOfInterval, format,
  isSameDay, isWithinInterval, addMonths, subMonths,
  startOfWeek, endOfWeek, parseISO,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// minDate / maxDate are optional "YYYY-MM-DD" strings.
// When provided, days outside the range are greyed/disabled and the range is highlighted.
// When omitted, all days are selectable with no special highlighting.
/**
 * @param {{ value: string, onChange: function, minDate?: string, maxDate?: string, disabled?: boolean }} props
 */
export default function ShiftDatePicker({ value, onChange, minDate, maxDate, disabled = false }) {
  const min = minDate ? parseISO(minDate) : null;
  const max = maxDate ? parseISO(maxDate) : null;
  const hasRange = !!(min && max);

  function isSelectable(day) {
    if (min && day < min) return false;
    if (max && day > max) return false;
    return true;
  }

  const [open, setOpen]           = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    if (value) return startOfMonth(parseISO(value));
    if (min)   return startOfMonth(min);
    return startOfMonth(new Date());
  });
  const containerRef = useRef(null);

  const selected = value ? parseISO(value) : null;

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

  const gridStart = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 0 });
  const gridEnd   = endOfWeek(endOfMonth(viewMonth),     { weekStartsOn: 0 });
  const days      = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const canGoPrev = hasRange ? viewMonth > startOfMonth(min) : true;
  const canGoNext = hasRange ? viewMonth < startOfMonth(max) : true;

  function selectDay(day) {
    onChange(format(day, 'yyyy-MM-dd'));
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className="w-full flex items-center gap-2 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-sm text-left transition-colors disabled:opacity-60 disabled:cursor-not-allowed hover:border-gray-400 dark:hover:border-gray-500 disabled:hover:border-gray-300 dark:disabled:hover:border-gray-600"
      >
        <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
        <span className={selected ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}>
          {selected ? format(selected, 'MMMM d, yyyy') : 'Select a date'}
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 border border-gray-200 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-800 shadow-lg select-none">
          <div className="flex items-center justify-between mb-1 px-1">
            <button
              type="button"
              onClick={() => setViewMonth(subMonths(viewMonth, 1))}
              disabled={!canGoPrev}
              className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            </button>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 px-2">
              {format(viewMonth, 'MMMM yyyy')}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth(addMonths(viewMonth, 1))}
              disabled={!canGoNext}
              className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          <div className="grid grid-cols-7">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-[10px] font-medium text-gray-400 dark:text-gray-500 py-0.5">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day) => {
              const inRange      = hasRange ? isWithinInterval(day, { start: min, end: max }) : isSelectable(day);
              const isSelected   = selected && isSameDay(day, selected);
              const outsideMonth = day.getMonth() !== viewMonth.getMonth();
              const base         = 'w-7 h-7 flex items-center justify-center text-xs mx-auto';

              if (isSelected) {
                return (
                  <button key={day.toISOString()} type="button" onClick={() => selectDay(day)}
                    className={`${base} rounded-full font-semibold bg-blue-600 text-white ${outsideMonth ? 'opacity-60' : ''}`}>
                    {day.getDate()}
                  </button>
                );
              }
              if (inRange) {
                return (
                  <button key={day.toISOString()} type="button" onClick={() => selectDay(day)}
                    className={`${base} rounded transition-colors ${
                      hasRange
                        ? 'font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800/60'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    } ${outsideMonth ? 'opacity-50' : ''}`}>
                    {day.getDate()}
                  </button>
                );
              }
              return (
                <span key={day.toISOString()}
                  className={`${base} text-gray-300 dark:text-gray-600 ${outsideMonth ? 'opacity-40' : ''}`}>
                  {day.getDate()}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
