'use client';

import { ReactNode, useState } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface ConfirmDeleteModalProps {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  // When set, the confirm button stays disabled until the admin types this
  // exact word into a text box — extra friction for the highest-stakes
  // deletes (e.g. an event and everything under it), left off everywhere
  // else so routine deletes stay two clicks.
  requireTypedConfirmation?: string;
}

// Shared style for every destructive delete/remove/cancel confirmation in
// the app — Cancel left, destructive action right, both flex-1. Introduced
// to replace native window.confirm() popups, which can't be styled and
// look inconsistent with everything else in the admin UI.
export default function ConfirmDeleteModal({
  title,
  message,
  confirmLabel = 'Delete',
  loading = false,
  onCancel,
  onConfirm,
  requireTypedConfirmation,
}: ConfirmDeleteModalProps) {
  const [typedValue, setTypedValue] = useState('');
  const isBlocked = requireTypedConfirmation !== undefined && typedValue !== requireTypedConfirmation;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <Card className="p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">{title}</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-start gap-3 mb-6">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
        </div>
        {requireTypedConfirmation !== undefined && (
          <div className="mb-6">
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">
              Type <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">{requireTypedConfirmation}</span> to confirm
            </label>
            <input
              type="text"
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              autoFocus
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
              placeholder={requireTypedConfirmation}
            />
          </div>
        )}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel} disabled={loading} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading || isBlocked}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}
