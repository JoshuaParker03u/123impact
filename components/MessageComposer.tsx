'use client';

import { useState, useEffect } from 'react';
import { getBrowserClient } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { REDACTED_EMAIL } from '@/lib/redact';
import FloatingWindow from '@/components/FloatingWindow';

interface MessageComposerProps {
  isOpen: boolean;
  onClose: () => void;
  eventId?: string;
  shiftId?: string;
  volunteerEmail?: string;
  volunteerName?: string;
  // The specific registration being messaged — required for a Discord DM to
  // go out on an individual send, since email alone isn't a unique key (one
  // person can have several registrations) and can't be traced back to a
  // discord_user_id reliably.
  volunteerRegistrationId?: string;
}

type RecipientType = 'event' | 'shift' | 'panel' | 'volunteer';
type CountRow = { email: string; discord_user_id: string | null };

export default function MessageComposer({
  isOpen,
  onClose,
  eventId,
  shiftId,
  volunteerEmail,
  volunteerName,
  volunteerRegistrationId,
}: MessageComposerProps) {
  // When opened with a preset event or shift (e.g. "Message Volunteers" from
  // an event's manage page, or the message action on a specific shift), the
  // "Send to" mode is fixed to match — shown for confirmation, not editable.
  // Only the standalone Messages page (no eventId/shiftId passed) leaves it open.
  const sendToLocked = !!eventId || !!shiftId;

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [recipientType, setRecipientType] = useState<RecipientType>(
    volunteerEmail ? 'volunteer' : shiftId ? 'shift' : 'event'
  );
  const [selectedEvent, setSelectedEvent] = useState(eventId || '');
  const [selectedShift, setSelectedShift] = useState(shiftId || '');
  const [selectedPanel, setSelectedPanel] = useState('');
  const [recipientCount, setRecipientCount] = useState(volunteerEmail ? 1 : 0);
  const [dmCount, setDmCount] = useState(0);
  const [waitlistFilter, setWaitlistFilter] = useState<'all' | 'confirmed' | 'waitlisted'>('all');
  const [roleFilter, setRoleFilter] = useState<Set<'volunteer' | 'attendee' | 'speaker'>>(
    new Set(['volunteer', 'attendee', 'speaker'])
  );
  const [events, setEvents] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [panels, setPanels] = useState<{ id: string; name: string }[]>([]);
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
        loadPanels(eventId);
      }
      if (shiftId) {
        setRecipientType('shift');
        setSelectedShift(shiftId);
      }
    }
  }, [isOpen, eventId, shiftId, volunteerEmail]);

  useEffect(() => {
    if (selectedEvent) {
      loadShifts(selectedEvent);
      loadPanels(selectedEvent);
    }
  }, [selectedEvent]);

  useEffect(() => {
    if (recipientType !== 'volunteer') updateRecipientCount();
  }, [recipientType, selectedEvent, selectedShift, selectedPanel, waitlistFilter, roleFilter]);

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

  async function loadPanels(evId: string) {
    const res = await fetch(`/api/events/${evId}/panels`);
    setPanels(res.ok ? await res.json() : []);
  }

  async function updateRecipientCount() {
    setLoading(true);
    let count = 0;
    let dms = 0;
    try {
      if (recipientType === 'event' && selectedEvent && roleFilter.size > 0) {
        // Query by event_id directly (set on every registration, shift-based or
        // shiftless) rather than joining through shifts — a purely shiftless
        // event has no shift rows at all, so the old shifts-first join always
        // returned zero recipients for those events.
        let q = supabase.from('volunteer_registrations').select('email, discord_user_id')
          .eq('event_id', selectedEvent)
          .in('attendee_type', [...roleFilter]);
        if (waitlistFilter !== 'all') q = q.eq('is_waitlisted', waitlistFilter === 'waitlisted');
        const { data } = await q;
        const rows = (data ?? []) as CountRow[];
        const unique = rows.filter((r, i, self) => i === self.findIndex((x) => x.email === r.email));
        count = unique.length;
        dms = unique.filter((r) => r.discord_user_id).length;
      } else if (recipientType === 'shift' && selectedShift) {
        let q = supabase
          .from('volunteer_registrations')
          .select('email, discord_user_id')
          .eq('shift_id', selectedShift);
        if (waitlistFilter !== 'all') q = q.eq('is_waitlisted', waitlistFilter === 'waitlisted');
        const { data } = await q;
        const rows = (data ?? []) as CountRow[];
        count = rows.length;
        dms = rows.filter((r) => r.discord_user_id).length;
      } else if (recipientType === 'panel' && selectedPanel && roleFilter.size > 0) {
        let q = supabase.from('volunteer_registrations').select('email, discord_user_id')
          .eq('panel_id', selectedPanel)
          .in('attendee_type', [...roleFilter]);
        if (waitlistFilter !== 'all') q = q.eq('is_waitlisted', waitlistFilter === 'waitlisted');
        const { data } = await q;
        const rows = (data ?? []) as CountRow[];
        const unique = rows.filter((r, i, self) => i === self.findIndex((x) => x.email === r.email));
        count = unique.length;
        dms = unique.filter((r) => r.discord_user_id).length;
      }
    } catch (e) {
      console.error('Error counting recipients:', e);
    }
    setRecipientCount(count);
    setDmCount(dms);
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
          panelId: recipientType === 'panel' ? selectedPanel : null,
          registrationId: recipientType === 'volunteer' ? volunteerRegistrationId : null,
          volunteerEmail: recipientType === 'volunteer' ? volunteerEmail : null,
          volunteerName:  recipientType === 'volunteer' ? volunteerName  : null,
          scheduledFor: sendMode === 'scheduled' ? scheduledFor : null,
          waitlistFilter,
          roles: (recipientType === 'event' || recipientType === 'panel') ? [...roleFilter] : null,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        const dmNote = data.dmCount > 0 ? ` (including ${data.dmCount} via Discord DM)` : '';
        if (data.scheduled) {
          alert(`Message scheduled for ${new Date(scheduledFor).toLocaleString()} — will be sent to ${data.recipientCount} recipient${data.recipientCount !== 1 ? 's' : ''}${dmNote}.`);
        } else {
          alert(`Message sent to ${data.recipientCount} recipient${data.recipientCount !== 1 ? 's' : ''}${dmNote}!`);
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
    <FloatingWindow title="Send Message" onClose={onClose} maxWidthClassName="max-w-2xl">
          <div className="space-y-4">
            {/* Send to selector — hidden for individual-volunteer sends and
                whenever opened with a preset event/shift (the mode is
                already implied by how the composer was opened, so there's
                nothing to choose). */}
            {!volunteerEmail && !sendToLocked && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Send to</label>
                <select
                  value={recipientType}
                  onChange={(e) => setRecipientType(e.target.value as RecipientType)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="event">Volunteers by Event</option>
                  <option value="shift">Volunteers by Shift</option>
                  <option value="panel">Volunteers by Panel</option>
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
                  onChange={(e) => !sendToLocked && setSelectedEvent(e.target.value)}
                  disabled={sendToLocked}
                  className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 ${
                    sendToLocked ? 'opacity-70 cursor-not-allowed' : ''
                  }`}
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
                    onChange={(e) => !sendToLocked && setSelectedEvent(e.target.value)}
                    disabled={sendToLocked}
                    className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 ${
                      sendToLocked ? 'opacity-70 cursor-not-allowed' : ''
                    }`}
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
                      onChange={(e) => !sendToLocked && setSelectedShift(e.target.value)}
                      disabled={sendToLocked}
                      className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 ${
                        sendToLocked ? 'opacity-70 cursor-not-allowed' : ''
                      }`}
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

            {recipientType === 'panel' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Event</label>
                  <select
                    value={selectedEvent}
                    onChange={(e) => !sendToLocked && setSelectedEvent(e.target.value)}
                    disabled={sendToLocked}
                    className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 ${
                      sendToLocked ? 'opacity-70 cursor-not-allowed' : ''
                    }`}
                  >
                    <option value="">Choose an event...</option>
                    {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
                  </select>
                </div>
                {selectedEvent && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Panel</label>
                    <select
                      value={selectedPanel}
                      onChange={(e) => setSelectedPanel(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Choose a panel...</option>
                      {panels.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}

            {/* Role filter — meaningful for event-wide and panel sends; shift
                registrations are always Volunteers, since Attendees/Speakers
                never pick a shift. */}
            {(recipientType === 'event' || recipientType === 'panel') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Roles</label>
                <div className="flex flex-col gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                  {(['volunteer', 'attendee', 'speaker'] as const).map((role) => (
                    <label key={role} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={roleFilter.has(role)}
                        onChange={(e) => {
                          setRoleFilter((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(role); else next.delete(role);
                            return next;
                          });
                        }}
                      />
                      {role === 'volunteer' ? 'Volunteers' : role === 'attendee' ? 'Attendees' : 'Speakers'}
                    </label>
                  ))}
                </div>
                {roleFilter.size === 0 && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">Select at least one role</p>
                )}
              </div>
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
                {loading
                  ? 'Calculating...'
                  : `This message will be sent to ${recipientCount} recipient${recipientCount !== 1 ? 's' : ''}${
                      dmCount > 0 ? ` (including ${dmCount} via Discord DM)` : ''
                    }`}
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
                onClick={onClose}
                className="flex-1 px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || recipientCount === 0}
                className="flex-1 bg-gradient-to-br from-blue-600 to-purple-600 hover:opacity-90 text-white py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending
                  ? (sendMode === 'scheduled' ? 'Scheduling...' : 'Sending...')
                  : (sendMode === 'scheduled' ? 'Schedule Message' : 'Send Message')}
              </button>
            </div>
          </div>
    </FloatingWindow>
  );
}
