'use client';

import { useState } from 'react';
import {
  startOfMonth, endOfMonth, eachDayOfInterval, format,
  isSameDay, isWithinInterval, addMonths, subMonths,
  startOfWeek, endOfWeek, parseISO,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function ShiftDatePicker({ value, onChange, minDate, maxDate }) {
  const min = parseISO(minDate);
  const max = parseISO(maxDate);

  const [viewMonth, setViewMonth] = useState(() => startOfMonth(min));

  const gridStart = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 0 });
  const gridEnd   = endOfWeek(endOfMonth(viewMonth),     { weekStartsOn: 0 });
  const days      = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const canGoPrev = viewMonth > startOfMonth(min);
  const canGoNext = viewMonth < startOfMonth(max);

  const selected = value ? parseISO(value) : null;

  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 bg-white dark:bg-gray-800 select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setViewMonth(subMonths(viewMonth, 1))}
          disabled={!canGoPrev}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        </button>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          {format(viewMonth, 'MMMM yyyy')}
        </span>
        <button
          type="button"
          onClick={() => setViewMonth(addMonths(viewMonth, 1))}
          disabled={!canGoNext}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 dark:text-gray-500 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((day) => {
          const inRange       = isWithinInterval(day, { start: min, end: max });
          const isSelected    = selected && isSameDay(day, selected);
          const outsideMonth  = day.getMonth() !== viewMonth.getMonth();

          if (isSelected) {
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => onChange(format(day, 'yyyy-MM-dd'))}
                className={`mx-auto w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold bg-blue-600 text-white ${outsideMonth ? 'opacity-60' : ''}`}
              >
                {day.getDate()}
              </button>
            );
          }

          if (inRange) {
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => onChange(format(day, 'yyyy-MM-dd'))}
                className={`mx-auto w-8 h-8 flex items-center justify-center rounded-md text-sm font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors ${outsideMonth ? 'opacity-50' : ''}`}
              >
                {day.getDate()}
              </button>
            );
          }

          return (
            <span
              key={day.toISOString()}
              className={`mx-auto w-8 h-8 flex items-center justify-center text-sm text-gray-300 dark:text-gray-600 ${outsideMonth ? 'opacity-40' : ''}`}
            >
              {day.getDate()}
            </span>
          );
        })}
      </div>

      {/* Selected date label */}
      {selected && (
        <p className="mt-2 text-xs text-center text-blue-600 dark:text-blue-400 font-medium">
          {format(selected, 'MMMM d, yyyy')}
        </p>
      )}
    </div>
  );
}
