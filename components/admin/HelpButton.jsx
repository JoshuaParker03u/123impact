'use client';

import { useState } from 'react';
import FloatingWindow from '@/components/FloatingWindow';

// A small "?" button that opens a non-blocking walkthrough window next to
// a form field -- reuses FloatingWindow (already draggable, stackable,
// Esc-to-close) rather than introducing a new tooltip/popover primitive.
export default function HelpButton({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Help: ${title}`}
        className="inline-flex items-center justify-center w-5 h-5 rounded border border-gray-400 dark:border-gray-500 text-gray-500 dark:text-gray-400 text-xs font-medium leading-none hover:border-blue-500 hover:text-blue-600 dark:hover:border-blue-400 dark:hover:text-blue-400"
      >
        ?
      </button>
      {open && (
        <FloatingWindow title={title} onClose={() => setOpen(false)} maxWidthClassName="max-w-md">
          <div className="text-sm text-gray-700 dark:text-gray-300 space-y-3">
            {children}
          </div>
        </FloatingWindow>
      )}
    </>
  );
}
