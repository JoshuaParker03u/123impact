'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, CalendarClock, Ban, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getBrowserClient } from '@/lib/supabase';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal';

const statusBadgeClass = {
  active:    'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400',
  ongoing:   'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
  cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  completed: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
};

// Lets an admin select multiple occurrences in a recurring series and
// cancel or delete them all at once, instead of one at a time. Complements
// EventModal's "apply to all future occurrences" checkbox, which only
// handles field edits (title/location/etc.) — this handles status/removal.
export default function SeriesManagerModal({ seriesId, onClose, onChanged }) {
  const supabase = getBrowserClient();
  const [events, setEvents]     = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading]   = useState(true);
  const [acting, setActing]     = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('events')
        .select('id, title, date, status')
        .eq('series_id', seriesId)
        .order('date', { ascending: true });
      if (cancelled) return;
      setEvents(data ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [seriesId, supabase]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const cancelSelected = async () => {
    if (selected.size === 0) return;
    setActing(true);
    const { error } = await supabase
      .from('events')
      .update({ status: 'cancelled' })
      .in('id', [...selected]);
    setActing(false);
    if (error) {
      alert('Error cancelling occurrences: ' + error.message);
      return;
    }
    setEvents((prev) => prev.map((e) => (selected.has(e.id) ? { ...e, status: 'cancelled' } : e)));
    onChanged?.();
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    setActing(true);
    const ids = [...selected];
    const failures = [];
    for (const id of ids) {
      const res = await fetch(`/api/events/${id}`, { method: 'DELETE' });
      if (!res.ok) failures.push(id);
    }
    setActing(false);
    setConfirmingDelete(false);
    setEvents((prev) => prev.filter((e) => !ids.includes(e.id) || failures.includes(e.id)));
    setSelected(new Set(failures));
    onChanged?.();

    if (failures.length > 0) {
      alert(`${failures.length} occurrence(s) could not be deleted.`);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="p-6 w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-indigo-600" /> Manage Series
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Select occurrences below, then cancel or delete them all at once.
            </p>
            <div className="flex-1 overflow-y-auto space-y-1.5 mb-4 pr-1">
              {events.map((e) => (
                <label
                  key={e.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(e.id)}
                    onChange={() => toggle(e.id)}
                    className="rounded"
                  />
                  <span className="flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{e.date}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusBadgeClass[e.status] ?? statusBadgeClass.completed}`}>
                    {e.status}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
              <Button
                variant="outline"
                onClick={cancelSelected}
                disabled={acting || selected.size === 0}
                className="flex-1 gap-2"
              >
                {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                Cancel Selected
              </Button>
              <Button
                variant="outline"
                onClick={() => setConfirmingDelete(true)}
                disabled={acting || selected.size === 0}
                className="flex-1 gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:border-red-900 dark:hover:bg-red-900/20"
              >
                <Trash2 className="w-4 h-4" /> Delete Selected
              </Button>
            </div>
          </>
        )}
      </Card>

      {confirmingDelete && (
        <ConfirmDeleteModal
          title="Delete Occurrences"
          message={`This will permanently delete ${selected.size} occurrence${selected.size === 1 ? '' : 's'}, along with their shifts and volunteer registrations. This cannot be undone.`}
          confirmLabel="Delete"
          loading={acting}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={deleteSelected}
        />
      )}
    </div>
  );
}
