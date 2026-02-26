'use client';

import { useState, useEffect, useCallback } from 'react';
import { Clock, Trash2, Users, Calendar } from 'lucide-react';

interface ScheduledMessage {
  id: string;
  subject: string;
  body: string;
  scheduled_for: string;
  recipient_count: number;
  recipient_type: 'all' | 'event' | 'shift';
  recipient_emails: string[];
  events: { title: string } | null;
  shifts: { name: string } | null;
}

export default function ScheduledMessagesList() {
  const [messages, setMessages]     = useState<ScheduledMessage[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [deleting, setDeleting]     = useState<string | null>(null);

  const load = useCallback((showSpinner = false) => {
    if (showSpinner) setLoading(true);
    fetch('/api/messages?scheduled=true')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setMessages(data);
        } else {
          setError(data.error ?? 'Failed to load scheduled messages');
        }
      })
      .catch(() => setError('Failed to load scheduled messages'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(true);
    const interval = setInterval(() => load(false), 30000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleCancel(id: string, subject: string) {
    if (!confirm(`Cancel the scheduled message "${subject}"? This cannot be undone.`)) return;

    setDeleting(id);
    try {
      const res = await fetch(`/api/messages?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== id));
        if (expanded === id) setExpanded(null);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch {
      alert('Failed to cancel message');
    } finally {
      setDeleting(null);
    }
  }

  function recipientLabel(msg: ScheduledMessage) {
    if (msg.recipient_type === 'all') return 'All Volunteers';
    if (msg.recipient_type === 'event' && msg.events) return `Event: ${msg.events.title}`;
    if (msg.recipient_type === 'shift' && msg.shifts) return `Shift: ${msg.shifts.name}`;
    return 'Selected volunteers';
  }

  if (loading) {
    return <p className="text-gray-500 py-8 text-center">Loading scheduled messages...</p>;
  }

  if (error) {
    return <p className="text-red-600 py-8 text-center">{error}</p>;
  }

  if (messages.length === 0) {
    return (
      <div className="py-12 text-center">
        <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No messages scheduled.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((msg) => (
        <div key={msg.id} className="border rounded-lg overflow-hidden">
          <div className="flex items-center px-4 py-3 gap-3">
            {/* Expand toggle */}
            <button
              className="flex-1 flex items-start gap-3 text-left min-w-0"
              onClick={() => setExpanded(expanded === msg.id ? null : msg.id)}
            >
              <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-medium truncate">{msg.subject}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-gray-500 mt-0.5">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(msg.scheduled_for).toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {msg.recipient_count} recipient{msg.recipient_count !== 1 ? 's' : ''}
                    {' · '}
                    {recipientLabel(msg)}
                  </span>
                </div>
              </div>
              <svg
                className={`w-4 h-4 text-gray-400 ml-auto shrink-0 transition-transform ${expanded === msg.id ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Cancel button */}
            <button
              onClick={() => handleCancel(msg.id, msg.subject)}
              disabled={deleting === msg.id}
              title="Cancel scheduled message"
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {expanded === msg.id && (
            <div className="px-4 pb-4 border-t bg-gray-50 space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-700 mt-3 mb-1">Message preview</p>
                <p className="text-sm text-gray-600 whitespace-pre-wrap line-clamp-5">{msg.body}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Recipients ({msg.recipient_emails?.length ?? 0})
                </p>
                <ul className="text-sm text-gray-600 space-y-0.5 max-h-40 overflow-y-auto">
                  {(msg.recipient_emails ?? []).map((email) => (
                    <li key={email}>{email}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
