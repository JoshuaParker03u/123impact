'use client';

import { ReactNode } from 'react';
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
}: ConfirmDeleteModalProps) {
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
        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel} disabled={loading} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
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
