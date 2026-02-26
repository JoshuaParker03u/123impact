'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface MessageComposerProps {
  isOpen: boolean;
  onClose: () => void;
  eventId?: string;
  shiftId?: string;
}

export default function MessageComposer({ 
  isOpen, 
  onClose, 
  eventId, 
  shiftId 
}: MessageComposerProps) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [recipientType, setRecipientType] = useState<'all' | 'event' | 'shift'>('all');
  const [selectedEvent, setSelectedEvent] = useState(eventId || '');
  const [selectedShift, setSelectedShift] = useState(shiftId || '');
  const [recipientCount, setRecipientCount] = useState(0);
  const [events, setEvents] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [sendMode, setSendMode] = useState<'now' | 'scheduled'>('now');
  const [scheduledFor, setScheduledFor] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    if (isOpen) {
      loadEvents();
      if (eventId) {
        setRecipientType('event');
        setSelectedEvent(eventId);
        loadShifts(eventId);
      }
      if (shiftId) {
        setRecipientType('shift');
        setSelectedShift(shiftId);
      }
    }
  }, [isOpen, eventId, shiftId]);

  useEffect(() => {
    if (selectedEvent) {
      loadShifts(selectedEvent);
    }
  }, [selectedEvent]);

  useEffect(() => {
    updateRecipientCount();
  }, [recipientType, selectedEvent, selectedShift]);

  async function loadEvents() {
    const { data } = await supabase
      .from('events')
      .select('id, title')
      .order('title');
    setEvents(data || []);
  }

  async function loadShifts(eventId: string) {
    const { data } = await supabase
      .from('shifts')
      .select('id, name, start_time')
      .eq('event_id', eventId)
      .order('start_time');
    setShifts(data || []);
  }

  async function updateRecipientCount() {
    setLoading(true);
    let count = 0;

    try {
      if (recipientType === 'all') {
        // Count unique emails across all registrations
        const { data } = await supabase
          .from('volunteer_registrations')
          .select('email');
        
        const uniqueEmails = new Set(data?.map(r => r.email) || []);
        count = uniqueEmails.size;
      } else if (recipientType === 'event' && selectedEvent) {
        const { data: shifts } = await supabase
          .from('shifts')
          .select('id')
          .eq('event_id', selectedEvent);
        
        const shiftIds = shifts?.map(s => s.id) || [];
        
        if (shiftIds.length > 0) {
          const { data } = await supabase
            .from('volunteer_registrations')
            .select('email')
            .in('shift_id', shiftIds);
          
          const uniqueEmails = new Set(data?.map(r => r.email) || []);
          count = uniqueEmails.size;
        }
      } else if (recipientType === 'shift' && selectedShift) {
        const { count: c } = await supabase
          .from('volunteer_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('shift_id', selectedShift);
        count = c || 0;
      }
    } catch (error) {
      console.error('Error counting recipients:', error);
    }

    setRecipientCount(count);
    setLoading(false);
  }

  async function handleSend() {
    if (!subject || !message) {
      alert('Please fill in subject and message');
      return;
    }

    if (recipientCount === 0) {
      alert('No recipients selected');
      return;
    }

    if (sendMode === 'scheduled') {
      if (!scheduledFor) {
        alert('Please choose a date and time to schedule the message');
        return;
      }
      if (new Date(scheduledFor) <= new Date()) {
        alert('Scheduled time must be in the future');
        return;
      }
    }

    setSending(true);

    try {
      const response = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          message,
          recipientType,
          eventId: recipientType !== 'all' ? selectedEvent : null,
          shiftId: recipientType === 'shift' ? selectedShift : null,
          scheduledFor: sendMode === 'scheduled' ? scheduledFor : null,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.scheduled) {
          alert(`Message scheduled for ${new Date(scheduledFor).toLocaleString()} — will be sent to ${data.recipientCount} volunteer${data.recipientCount !== 1 ? 's' : ''}.`);
        } else {
          alert(`Message sent to ${data.recipientCount} volunteer${data.recipientCount !== 1 ? 's' : ''}!`);
        }
        onClose();
        setSubject('');
        setMessage('');
        setSendMode('now');
        setScheduledFor('');
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setSending(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Send Message</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Send to
              </label>
              <select
                value={recipientType}
                onChange={(e) => setRecipientType(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Volunteers</option>
                <option value="event">Volunteers by Event</option>
                <option value="shift">Volunteers by Shift</option>
              </select>
            </div>

            {recipientType === 'event' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Event
                </label>
                <select
                  value={selectedEvent}
                  onChange={(e) => setSelectedEvent(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Choose an event...</option>
                  {events.map(event => (
                    <option key={event.id} value={event.id}>{event.title}</option>
                  ))}
                </select>
              </div>
            )}

            {recipientType === 'shift' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Event
                  </label>
                  <select
                    value={selectedEvent}
                    onChange={(e) => setSelectedEvent(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Choose an event...</option>
                    {events.map(event => (
                      <option key={event.id} value={event.id}>{event.title}</option>
                    ))}
                  </select>
                </div>
                {selectedEvent && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Shift
                    </label>
                    <select
                      value={selectedShift}
                      onChange={(e) => setSelectedShift(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Choose a shift...</option>
                      {shifts.map(shift => (
                        <option key={shift.id} value={shift.id}>
                          {shift.name || 'Shift'} - {new Date(shift.start_time).toLocaleString()}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                {loading ? 'Calculating...' : `This message will be sent to ${recipientCount} volunteer${recipientCount !== 1 ? 's' : ''}`}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Message subject"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Write your message here..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                When to send
              </label>
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setSendMode('now')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    sendMode === 'now'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Send Now
                </button>
                <button
                  type="button"
                  onClick={() => setSendMode('scheduled')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    sendMode === 'scheduled'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Schedule for Later
                </button>
              </div>
              {sendMode === 'scheduled' && (
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  min={(() => {
                    const d = new Date(Date.now() + 60000);
                    const pad = (n: number) => String(n).padStart(2, '0');
                    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                  })()}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSend}
                disabled={sending || recipientCount === 0}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending
                  ? (sendMode === 'scheduled' ? 'Scheduling...' : 'Sending...')
                  : (sendMode === 'scheduled' ? 'Schedule Message' : 'Send Message')
                }
              </button>
              <button
                onClick={onClose}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
