'use client';

import { useState, useEffect } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';

interface Message {
  id: string;
  subject: string;
  sent_at: string;
  recipient_emails: string[];
  recipients: { email: string; name: string }[];
  events: { title: string } | null;
  shifts: { name: string; start_time: string } | null;
}

export default function SentMessagesHistory() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { currentOrganization } = useOrganization() as { currentOrganization: { id: string } | null };

  useEffect(() => {
    const url = currentOrganization?.id
      ? `/api/messages?org_id=${currentOrganization.id}`
      : '/api/messages';
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setMessages(data);
        } else {
          setError(data.error ?? 'Failed to load messages');
        }
      })
      .catch(() => setError('Failed to load messages'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-gray-500 py-8 text-center">Loading message history...</p>;
  }

  if (error) {
    return <p className="text-red-600 py-8 text-center">{error}</p>;
  }

  if (messages.length === 0) {
    return <p className="text-gray-500 py-8 text-center">No messages sent yet.</p>;
  }

  return (
    <div className="space-y-3">
      {messages.map((msg) => (
        <div key={msg.id} className="border dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
            onClick={() => setExpanded(expanded === msg.id ? null : msg.id)}
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{msg.subject}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {new Date(msg.sent_at).toLocaleString()} &middot; {msg.recipient_emails.length} recipient{msg.recipient_emails.length !== 1 ? 's' : ''}
                {msg.events && ` \u00b7 ${msg.events.title}`}
                {msg.shifts && ` \u00b7 ${msg.shifts.name}`}
              </p>
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 ml-3 shrink-0 transition-transform ${expanded === msg.id ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expanded === msg.id && (
            <div className="px-4 pb-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-3 mb-1">Recipients</p>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-0.5 max-h-40 overflow-y-auto">
                {msg.recipients.map((r) => (
                  <li key={r.email}>{r.email}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
