'use client';

import { X, Send, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface DiscordPostConfirmModalProps {
  channelName: string | null;
  loading?: boolean;
  // null = still confirming, 'success' = sent, any other string = the error
  // message from a failed send. The modal stays open and shows the result
  // in place, rather than closing into a native alert().
  result?: 'success' | string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

// Confirmation gate for any "post to Discord" action — sending an automated
// message to a real channel is visible to everyone there and can't be
// unsent, so it gets a click-to-confirm step rather than firing immediately.
export default function DiscordPostConfirmModal({
  channelName,
  loading = false,
  result = null,
  onCancel,
  onConfirm,
}: DiscordPostConfirmModalProps) {
  const isSuccess = result === 'success';
  const isError   = result !== null && !isSuccess;
  const channelLabel = channelName
    ? <span className="font-medium text-gray-900 dark:text-gray-100">#{channelName}</span>
    : 'your Discord announcement channel';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <Card className="p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {isSuccess ? 'Posted to Discord' : isError ? 'Couldn’t post to Discord' : 'Post to Discord?'}
          </h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-start gap-3 mb-6">
          {isSuccess ? (
            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
          ) : isError ? (
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          ) : (
            <Send className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          )}
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {isSuccess ? (
              <>Your message is live in {channelLabel}.</>
            ) : isError ? (
              result
            ) : (
              <>You&apos;re about to send an automated message to {channelLabel}. Everyone in that channel will see it.</>
            )}
          </p>
        </div>

        <div className="flex gap-3">
          {isSuccess ? (
            <Button onClick={onCancel} className="flex-1 bg-gradient-to-br from-blue-600 to-purple-600 hover:opacity-90 text-white">
              Done
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={onCancel} disabled={loading} className="flex-1">
                Cancel
              </Button>
              <Button onClick={onConfirm} disabled={loading} className="flex-1 bg-gradient-to-br from-blue-600 to-purple-600 hover:opacity-90 text-white">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {isError ? 'Try Again' : 'Confirm'}
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
