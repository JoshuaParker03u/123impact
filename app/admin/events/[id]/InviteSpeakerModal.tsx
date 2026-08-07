'use client';

import { useState } from 'react';
import { X, Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ExistingInvite {
  email: string;
  topic: string | null;
  status: string;
}

interface InviteSpeakerModalProps {
  onClose: () => void;
  onInvite: (email: string, topic: string, sessionTime: string) => Promise<string | null>; // returns an error message, or null on success
  existingInvites?: ExistingInvite[];
  initialEmail?: string;
}

// The inviter specifies the topic here, up front — the invitee then sees
// it locked in on their signup form instead of being asked to write it
// themselves. Kept as its own modal (matching CheckInQRModal's pattern) so
// more inviter-specified fields can be added here later without cluttering
// the invites list.
export default function InviteSpeakerModal({ onClose, onInvite, existingInvites = [], initialEmail }: InviteSpeakerModalProps) {
  const [email, setEmail] = useState(initialEmail ?? '');
  const [topic, setTopic] = useState('');
  const [sessionTime, setSessionTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Same person can give multiple talks at the same event — this is just a
  // heads-up, never blocking. The server enforces the real duplicate rule
  // (same person, same topic).
  const otherTalks = existingInvites.filter(
    (i) => i.email.toLowerCase() === email.trim().toLowerCase() && ['pending', 'accepted'].includes(i.status)
  );

  async function submit() {
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid email'); return; }
    if (!topic.trim()) { setError('Enter a session topic'); return; }
    setSubmitting(true);
    const err = await onInvite(email.trim(), topic.trim(), sessionTime);
    setSubmitting(false);
    if (err) { setError(err); return; }
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Invite a Speaker</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          They&apos;ll get a unique link to confirm — no account required. Set the topic now so they don&apos;t have to.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="speaker@example.com"
              autoFocus={!initialEmail}
              className="w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
            />
            {otherTalks.length > 0 && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                This person already has {otherTalks.length} other talk{otherTalks.length === 1 ? '' : 's'} at this event
                {otherTalks.some((t) => t.topic) ? `: ${otherTalks.map((t) => t.topic).filter(Boolean).join(', ')}` : ''}.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Session Topic</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What will they be speaking about?"
              autoFocus={!!initialEmail}
              className="w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Session Time (optional)
            </label>
            <input
              type="time"
              value={sessionTime}
              onChange={(e) => setSessionTime(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Can be set or changed later if the schedule isn&apos;t finalized yet.</p>
          </div>
        </div>

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}

        <div className="flex items-center gap-2 mt-5">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !email.trim() || !topic.trim()} className="gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Send Invite
          </Button>
        </div>
      </div>
    </div>
  );
}
