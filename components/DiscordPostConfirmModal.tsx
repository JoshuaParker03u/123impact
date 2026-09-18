'use client';

import { X, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface DiscordPostConfirmModalProps {
  channelName: string | null;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// Confirmation gate for any "post to Discord" action — sending an automated
// message to a real channel is visible to everyone there and can't be
// unsent, so it gets a click-to-confirm step rather than firing immediately.
export default function DiscordPostConfirmModal({
  channelName,
  loading = false,
  onCancel,
  onConfirm,
}: DiscordPostConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <Card className="p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Post to Discord?</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-start gap-3 mb-6">
          <Send className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            You&apos;re about to send an automated message to{' '}
            {channelName ? <span className="font-medium text-gray-900 dark:text-gray-100">#{channelName}</span> : 'your Discord announcement channel'}.
            Everyone in that channel will see it.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel} disabled={loading} className="flex-1">
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={loading} className="flex-1 bg-gradient-to-br from-blue-600 to-purple-600 hover:opacity-90 text-white">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Confirm
          </Button>
        </div>
      </Card>
    </div>
  );
}
