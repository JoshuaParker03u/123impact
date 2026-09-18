'use client';

import { ReactNode, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Ever-incrementing counter shared by every open FloatingWindow — whichever
// instance last touched it renders on top, so clicking a background window
// brings it to front the way a real window manager would.
let topZ = 100;

interface FloatingWindowProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  maxWidthClassName?: string;
  // Skip the default body padding for modals that already lay themselves
  // out as distinct header/body/footer regions with their own padding and
  // borders (e.g. a bordered footer flush with the window's edges).
  noPadding?: boolean;
}

const titleId = () => `floating-window-title-${Math.random().toString(36).slice(2)}`;

// Non-blocking replacement for the old `fixed inset-0 bg-black/50 ...`
// dialog shell used across the admin UI. Deliberately has no backdrop —
// the page behind stays fully visible and clickable — and can be dragged
// by its titlebar, so an admin can move a form out of the way to reference
// something behind it instead of it blocking the whole screen. Destructive
// confirmations (see ConfirmDeleteModal) and the Stripe checkout flow
// intentionally keep the old blocking pattern instead of using this.
export default function FloatingWindow({ title, onClose, children, maxWidthClassName = 'max-w-lg', noPadding = false }: FloatingWindowProps) {
  const windowRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [isDesktop, setIsDesktop] = useState(true);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [z] = useState(() => ++topZ);
  const [labelId] = useState(titleId);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Center the window over the viewport once we know its rendered size,
  // rather than relying on a CSS transform so drag math can use plain px.
  useLayoutEffect(() => {
    if (!isDesktop || pos) return;
    const el = windowRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      x: Math.max(0, (window.innerWidth - rect.width) / 2),
      y: Math.max(16, (window.innerHeight - rect.height) / 3),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop]);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent) => {
      const margin = 48; // keep at least this much of the titlebar on-screen
      const el = windowRef.current;
      const width = el?.offsetWidth ?? 0;
      const x = Math.min(Math.max(e.clientX - dragOffset.current.x, margin - width), window.innerWidth - margin);
      const y = Math.min(Math.max(e.clientY - dragOffset.current.y, 0), window.innerHeight - margin);
      setPos({ x, y });
    };
    const handleUp = () => setDragging(false);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && z === topZ) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, z]);

  function handleDragStart(e: ReactMouseEvent) {
    const el = windowRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setPos({ x: rect.left, y: rect.top });
    setDragging(true);
  }

  function bringToFront() {
    topZ += 1;
    if (windowRef.current) windowRef.current.style.zIndex = String(topZ);
  }

  return (
    <div
      ref={windowRef}
      role="dialog"
      aria-labelledby={labelId}
      onMouseDownCapture={bringToFront}
      style={{
        zIndex: z,
        ...(isDesktop
          ? { position: 'fixed', left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: pos ? 'visible' : 'hidden' }
          : {}),
      }}
      className={cn(
        'bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-h-[90vh] overflow-y-auto',
        maxWidthClassName,
        !isDesktop && 'fixed inset-x-4 top-8 mx-auto',
      )}
    >
      <div
        onMouseDown={isDesktop ? handleDragStart : undefined}
        className={cn(
          'flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-900 rounded-t-xl',
          isDesktop && 'cursor-move select-none',
        )}
      >
        <h2 id={labelId} className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate flex items-center gap-2">{title}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 ml-3">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className={noPadding ? undefined : 'p-6'}>{children}</div>
    </div>
  );
}
