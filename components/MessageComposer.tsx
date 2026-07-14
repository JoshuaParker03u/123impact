'use client';

import { useState, useEffect } from 'react';
import { getBrowserClient } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { REDACTED_EMAIL } from '@/lib/redact';
import { X } from 'lucide-react';

interface MessageComposerProps {
  isOpen: boolean;
  onClose: () => void;
  eventId?: string;
  shiftId?: string;
  volunteerEmail?: string;
  volunteerName?: string;
}

type RecipientType = 'event' | 'shift' | 'volunteer';

export default function MessageComposer({
  isOpen,
  onClose,
  eventId,
  shiftId,
  volunteerEmail,
  volunteerName,
}: MessageComposerProps) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [recipientType, setRecipientType] = useState<RecipientType>(
    volunteerEmail ? 'volunteer' : shiftId ? 'shift' : 'event'
  );
  const [selectedEvent, setSelectedEvent] = useState(eventId || '');
  const [selectedShift, setSelectedShift] = useState(shiftId || '');
  const [recipientCount, setRecipientCount] = useState(volunteerEmail ? 1 : 0);
  const [waitlistFilter, setWaitlistFilter] = useState<'all' | 'confirmed' | 'waitlisted'>('all');
  const [events, setEvents] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [sendMode, setSendMode] = useState<'now' | 'scheduled'>('now');
  const [scheduledFor, setScheduledFor] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const { currentOrganization } = useOrganization() as { currentOrganization: { id: string } | null };
  const supabase = getBrowserClient();

  useEffect(() => {
    if (isOpen) {
      // Start every open with a clean draft — these instances stay mounted
      // across recipients, so stale subject/body must not carry over.
      setSubject('');
      setMessage('');
      setSendMode('now');
      setScheduledFor('');
      if (volunteerEmail) {
        setRecipientType('volunteer');
        setRecipientCount(1);
        return;
      }
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
  }, [isOpen, eventId, shiftId, volunteerEmail]);

  useEffect(() => {
    if (selectedEvent) loadShifts(selectedEvent);
  }, [selectedEvent]);

  useEffect(() => {
    if (recipientType !== 'volunteer') updateRecipientCount();
  }, [recipientType, selectedEvent, selectedShift, waitlistFilter]);

  async function loadEvents() {
    let query = supabase.from('events').select('id, title').order('title');
    if (currentOrganization?.id) query = query.eq('organization_id', currentOrganization.id);
    const { data } = await query;
    setEvents(data || []);
  }

  async function loadShifts(evId: string) {
    const { data } = await supabase
      .from('shifts')
      .select('id, name, start_time')
      .eq('event_id', evId)
      .order('start_time');
    setShifts(data || []);
  }

  async function updateRecipientCount() {
    setLoading(true);
    let count = 0;
    try {
      if (recipientType === 'event' && selectedEvent) {
        const { data: shiftRows } = await supabase.from('shifts').select('id').eq('event_id', selectedEvent);
        const shiftIds = shiftRows?.map((s: any) => s.id) || [];
        if (shiftIds.length > 0) {
          let q = supabase.from('volunteer_registrations').select('email').in('shift_id', shiftIds);
          if (waitlistFilter !== 'all') q = q.eq('is_waitlisted', waitlistFilter === 'waitlisted');
          const { data } = await q;
          count = new Set(data?.map((r: any) => r.email) || []).size;
        }
      } else if (recipientType === 'shift' && selectedShift) {
        let q = supabase
          .from('volunteer_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('shift_id', selectedShift);
        if (waitlistFilter !== 'all') q = q.eq('is_waitlisted', waitlistFilter === 'waitlisted');
        const { count: c } = await q;
        count = c || 0;
      }
    } catch (e) {
      console.error('Error counting recipients:', e);
    }
    setRecipientCount(count);
    setLoading(false);
  }

  async function handleSend() {
    if (!subject || !message) { alert('Please fill in subject and message'); return; }
    if (recipientCount === 0) { alert('No recipients selected'); return; }
    if (sendMode === 'scheduled') {
      if (!scheduledFor) { alert('Please choose a date and time to schedule the message'); return; }
      if (new Date(scheduledFor) <= new Date()) { alert('Scheduled time must be in the future'); return; }
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
          eventId: selectedEvent || null,
          shiftId: recipientType === 'shift' ? selectedShift : null,
          volunteerEmail: recipientType === 'volunteer' ? volunteerEmail : null,
          volunteerName:  recipientType === 'volunteer' ? volunteerName  : null,
          scheduledFor: sendMode === 'scheduled' ? scheduledFor : null,
          waitlistFilter,
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
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setSending(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Send Message</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Send to selector — hidden when opened for a specific volunteer */}
            {!volunteerEmail && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Send to</label>
                <select
                  value={recipientType}
                  onChange={(e) => setRecipientType(e.target.value as RecipientType)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="event">Volunteers by Event</option>
                  <option value="shift">Volunteers by Shift</option>
                </select>
              </div>
            )}

            {/* Individual volunteer display */}
            {recipientType === 'volunteer' && (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {(volunteerName || volunteerEmail || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  {volunteerName && <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{volunteerName}</p>}
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{REDACTED_EMAIL}</p>
                </div>
              </div>
            )}

            {recipientType === 'event' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Event</label>
                <select
                  value={selectedEvent}
                  onChange={(e) => setSelectedEvent(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Choose an event...</option>
                  {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
                </select>
              </div>
            )}

            {recipientType === 'shift' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Event</label>
                  <select
                    value={selectedEvent}
                    onChange={(e) => setSelectedEvent(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Choose an event...</option>
                    {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
                  </select>
                </div>
                {selectedEvent && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Shift</label>
                    <select
                      value={selectedShift}
                      onChange={(e) => setSelectedShift(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Choose a shift...</option>
                      {shifts.map(s => (
                        <option key={s.id} value={s.id}>{s.name || 'Shift'} - {s.start_time}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}

            {/* Waitlist filter — not relevant for individual sends */}
            {recipientType !== 'volunteer' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Recipients</label>
                <div className="flex flex-col gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                  {(['all', 'confirmed', 'waitlisted'] as const).map((v) => (
                    <label key={v} className="flex items-center gap-2">
                      <input type="radio" name="waitlistFilter" checked={waitlistFilter === v} onChange={() => setWaitlistFilter(v)} />
                      {v === 'all' ? 'All volunteers (confirmed + waitlisted)' : v === 'confirmed' ? 'Confirmed volunteers only' : 'Waitlisted volunteers only'}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                {loading ? 'Calculating...' : `This message will be sent to ${recipientCount} volunteer${recipientCount !== 1 ? 's' : ''}`}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                placeholder="Message subject"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                placeholder="Write your message here..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">When to send</label>
              <div className="flex gap-2 mb-3">
                {(['now', 'scheduled'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSendMode(m)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      sendMode === m
                        ? 'bg-gradient-to-br from-blue-600 to-purple-600 text-white border-transparent'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {m === 'now' ? 'Send Now' : 'Schedule for Later'}
                  </button>
                ))}
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
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSend}
                disabled={sending || recipientCount === 0}
                className="flex-1 bg-gradient-to-br from-blue-600 to-purple-600 hover:opacity-90 text-white py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending
                  ? (sendMode === 'scheduled' ? 'Scheduling...' : 'Sending...')
                  : (sendMode === 'scheduled' ? 'Schedule Message' : 'Send Message')}
              </button>
              <button
                onClick={onClose}
                className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
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
