'use client';

import { useState, useEffect } from 'react';

export default function SentMessagesHistory() {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingRecipients, setViewingRecipients] = useState<string | null>(null);

  useEffect(() => {
    loadMessages();
  }, []);

  async function loadMessages() {
    setLoading(true);
    const response = await fetch('/api/messages');
    const data = await response.json();
    setMessages(data);
    setLoading(false);
  }

  function getStatusBadge(status: string) {
    const styles = {
      delivered: 'bg-green-100 text-green-800 border-green-200',
      sent: 'bg-blue-100 text-blue-800 border-blue-200',
      failed: 'bg-red-100 text-red-800 border-red-200',
    };
    
    const icons = {
      delivered: '✓',
      sent: '→',
      failed: '✗',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${styles[status as keyof typeof styles]}`}>
        {icons[status as keyof typeof icons]} {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  }

  function getRecipientTypeLabel(type: string) {
    const labels = {
      all: 'All Volunteers',
      event: 'Event Volunteers',
      shift: 'Shift Volunteers',
    };
    return labels[type as keyof typeof labels] || type;
  }

  function copyRecipientsToClipboard(recipients: any[]) {
    const text = recipients.map(r => r.email).join('\n');
    navigator.clipboard.writeText(text);
    alert('Email addresses copied to clipboard!');
  }

  // Recipient Detail View
  if (viewingRecipients) {
    const message = messages.find(m => m.id === viewingRecipients);
    if (!message) return null;

    return (
      <div className="space-y-6">
        <nav className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setViewingRecipients(null)}
            className="text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Sent Messages
          </button>
        </nav>

        <div>
          <h2 className="text-2xl font-bold">Message Recipients</h2>
          <p className="text-gray-600">{message.subject}</p>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="font-semibold text-lg">{message.subject}</h3>
              <p className="text-sm text-gray-600 mt-2">
                {getRecipientTypeLabel(message.recipient_type)}
                {message.events && ` • ${message.events.title}`}
              </p>
            </div>
            {getStatusBadge(message.delivery_status)}
          </div>
          <p className="text-sm text-gray-600">
            Sent {new Date(message.sent_at).toLocaleString()}
          </p>
        </div>

        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
            <div>
              <h3 className="font-semibold">Recipients ({message.recipient_count})</h3>
              <p className="text-sm text-gray-600">Email addresses sent to</p>
            </div>
            <button
              onClick={() => copyRecipientsToClipboard(message.recipients)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            >
              Copy All Emails
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {message.recipients?.map((recipient: any, index: number) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-500">{index + 1}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{recipient.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            Click "Copy All Emails" to copy all addresses to your clipboard. Each email is on a new line.
          </p>
        </div>
      </div>
    );
  }

  // Messages List View
  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Sent Messages</h2>
          <p className="text-gray-600">Delivery history and status</p>
        </div>
        <button
          onClick={loadMessages}
          className="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg"
        >
          Refresh
        </button>
      </div>

      {messages.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600">No messages sent yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{msg.subject}</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {getRecipientTypeLabel(msg.recipient_type)}
                    {msg.events && ` • ${msg.events.title}`}
                    {msg.shifts && ` • ${msg.shifts.name || 'Shift'}`}
                  </p>
                </div>
                {getStatusBadge(msg.delivery_status)}
              </div>

              <div className="bg-gray-50 rounded p-3 mb-3">
                <p className="text-sm text-gray-700 line-clamp-2">{msg.body}</p>
              </div>

              <div className="flex justify-between items-center text-sm">
                <button
                  onClick={() => setViewingRecipients(msg.id)}
                  className="text-blue-600 hover:text-blue-700 hover:underline font-medium"
                >
                  {msg.recipient_count} recipient{msg.recipient_count !== 1 ? 's' : ''}
                </button>
                <span className="text-gray-500">{new Date(msg.sent_at).toLocaleString()}</span>
              </div>

              {msg.error_message && (
                <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                  Error: {msg.error_message}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
