'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import FloatingWindow from '@/components/FloatingWindow';
import ShiftDatePicker from './ShiftDatePicker';
import LocationAutocomplete from './LocationAutocomplete';
import TimezoneShiftNotice from './TimezoneShiftNotice';
import HelpButton from './HelpButton';
import ShowtimeReminderList from './ShowtimeReminderList';
import { convertWallClock, buildDayHoursRows } from '@/lib/timezone-convert';
import { saveShowtimeReminders, findDuplicateLeadMinutes } from '@/lib/discord/save-showtime-reminders';
import { useStreamerMode } from '@/contexts/StreamerModeContext';
import { Upload, Link as LinkIcon, Copy, Check } from 'lucide-react';

function generateSlug(title, suffix) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
  return base ? `${base}-${suffix}` : '';
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 6);
}

function getEventDays(start, end) {
  if (!start) return [];
  const days = [];
  const cur = new Date(start + 'T00:00:00');
  const last = new Date((end || start) + 'T00:00:00');
  while (cur <= last) {
    days.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

const inputCls = 'w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600';
const timeInputCls = 'border rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600';
const TITLE_MAX = 75;
const IMAGE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'];
const IMAGE_MAX_SIZE = 5 * 1024 * 1024;

// ── Event image (upload file OR paste URL, falls back to org logo) ──────────

function EventImageUploader({ value, onChange, organizationId, orgLogoUrl, disabled }) {
  const fileInputRef = useRef(null);
  const [tab, setTab] = useState('upload');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(file) {
    setError('');
    if (!file) return;
    if (!IMAGE_ALLOWED_TYPES.includes(file.type)) {
      setError('Invalid type. Use JPG, PNG, SVG, or WebP.');
      return;
    }
    if (file.size > IMAGE_MAX_SIZE) {
      setError('File too large. Max 5 MB.');
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.append('organization_id', organizationId);
      body.append('image_file', file);

      const res = await fetch('/api/events/image', { method: 'POST', body });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? 'Upload failed');
      onChange(result.url);
    } catch (err) {
      setError(err.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }

  const previewUrl = value || orgLogoUrl;
  const usingOrgDefault = !value && !!orgLogoUrl;

  return (
    <div>
      {/* Tab switcher */}
      <div className="flex gap-1 mb-3 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        {['upload', 'url'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            {t === 'upload' ? <Upload className="w-3.5 h-3.5" /> : <LinkIcon className="w-3.5 h-3.5" />}
            {t === 'upload' ? 'Upload File' : 'Image URL'}
          </button>
        ))}
      </div>

      {tab === 'upload' ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
          }`}
        >
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {uploading ? 'Uploading...' : <>Drag & drop or <span className="text-blue-600 dark:text-blue-400 font-medium">browse</span></>}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">JPG, PNG, SVG, WebP — max 5 MB</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Recommended: 1200 × 400 px (renders as a wide banner on the signup page)</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/svg+xml,image/webp"
            className="hidden"
            disabled={disabled || uploading}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
      ) : (
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          disabled={disabled}
          className={inputCls}
        />
      )}
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}

      {previewUrl && (
        <div className="mt-3 flex items-center gap-3">
          <img src={previewUrl} alt="Preview" className="w-16 h-16 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {usingOrgDefault
              ? "Using your organization's logo by default. Upload or paste a URL to use a custom image."
              : 'Preview'}
          </p>
        </div>
      )}
      {!previewUrl && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          If left blank, your organization's logo will be used.
        </p>
      )}
    </div>
  );
}

export default function EventModal({ event, organizationId, organizationLogoUrl = null, organizationTimezone = null, personalTimezone = null, onClose, onSave, supabase, isPaid = false }) {
  const { streamerMode } = useStreamerMode();
  const [slugSuffix] = useState(() => randomSuffix());
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugCopied, setSlugCopied] = useState(false);
  const [formData, setFormData] = useState({
    event_id:            event?.event_id            || '',
    title:               event?.title               || '',
    date:                event?.date                || '',
    end_date:            event?.end_date            || '',
    time:                event?.time                || '',
    location:            event?.location            || '',
    description:         event?.description         || '',
    image_url:           event?.image_url           || '',
    status:              event?.status              || 'active',
    event_format:        event?.event_format        || 'in_person',
    online_url:          event?.online_url          || '',
    recording_url:       event?.recording_url       || '',
    is_shiftless:        event?.is_shiftless        ?? false,
    shiftless_capacity:  event?.shiftless_capacity  ?? '',
    attendee_enabled:    event?.attendee_enabled    ?? false,
    attendee_capacity:   event?.attendee_capacity   ?? '',
    speaker_enabled:     event?.speaker_enabled     ?? false,
    panels_enabled:      event?.panels_enabled      ?? false,
    discord_showtime_webhook_url:  event?.discord_showtime_webhook_url  || '',
  });
  const [showtimeReminders, setShowtimeReminders] = useState(() =>
    (event?.discord_showtime_reminders ?? []).map(r => ({ lead_minutes: String(r.lead_minutes), message: r.message ?? '' }))
  );
  const [isMultiDay, setIsMultiDay] = useState(!!event?.end_date);
  const [applyToSeries, setApplyToSeries] = useState(false);
  // Stored rows are org-timezone wall-clock values -- convert to the
  // viewing admin's own personal timezone for display, anchored by each
  // row's start time (a single DB row can't represent two different
  // display dates for start vs. end). Re-saving an untouched row converts
  // back to the exact original (see lib/timezone-convert.ts).
  const [dayHours, setDayHours] = useState(() =>
    (event?.event_day_hours ?? []).reduce((acc, r) => {
      const startConv = convertWallClock(r.event_date, r.start_time, organizationTimezone, personalTimezone);
      const endConv = convertWallClock(r.event_date, r.end_time, organizationTimezone, personalTimezone);
      const displayDate = startConv?.date ?? r.event_date;
      acc[displayDate] = {
        start_time: startConv?.time ?? r.start_time,
        end_time: endConv?.time ?? r.end_time,
      };
      return acc;
    }, {})
  );
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const hasVolunteers = !!event && (event.shifts ?? []).reduce((sum, s) => sum + (s.filled ?? 0), 0) > 0;
  const hasShifts = !!event && (event.shifts ?? []).length > 0;

  const handleTitleChange = (value) => {
    const updates = { title: value };
    if (!event && !slugEdited) {
      updates.event_id = generateSlug(value, slugSuffix);
    }
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const copySlug = () => {
    navigator.clipboard.writeText(formData.event_id);
    setSlugCopied(true);
    setTimeout(() => setSlugCopied(false), 2000);
  };

  const locationRequired = formData.event_format !== 'online';

  const validate = () => {
    const newErrors = {};
    if (!formData.title.trim()) newErrors.title = 'Title is required';
    if (!formData.date) newErrors.date = 'Date is required';
    if (formData.end_date && formData.end_date < formData.date) newErrors.end_date = 'End date must be on or after start date';
    if (locationRequired && !formData.location.trim()) newErrors.location = 'Location is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const saveDayHours = async (eventId, convertedRows) => {
    const days = getEventDays(formData.date, formData.end_date || formData.date);
    const upsertRows = convertedRows.map(r => ({ event_id: eventId, ...r }));

    if (upsertRows.length > 0) {
      await supabase.from('event_day_hours').upsert(upsertRows, { onConflict: 'event_id,event_date' });
    }
    // Remove rows for days no longer represented -- the union of the plain
    // schedule-day range AND every row's actual (possibly timezone-shifted)
    // target date, so a day that legitimately rolled onto a date outside
    // `days` isn't immediately deleted again right after being upserted.
    const keepDates = [...new Set([...days, ...convertedRows.map(r => r.event_date)])];
    if (keepDates.length > 0) {
      await supabase.from('event_day_hours').delete().eq('event_id', eventId)
        .not('event_date', 'in', `(${keepDates.map(d => `"${d}"`).join(',')})`);
    } else {
      await supabase.from('event_day_hours').delete().eq('event_id', eventId);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    // Resolve day-hours timezone conversion (and the collision check) before
    // touching the event row at all, so a conversion error never leaves the
    // event saved with its day-hours only partially updated.
    const dayHoursResult = buildDayHoursRows(
      dayHours,
      getEventDays(formData.date, formData.end_date || formData.date),
      personalTimezone,
      organizationTimezone,
    );
    if (dayHoursResult.error) {
      alert(dayHoursResult.error);
      return;
    }

    // Same reasoning as the day-hours check above -- validate before any
    // write happens, so a duplicate lead time never leaves the event saved
    // with its reminders only partially updated.
    const reminderRows = showtimeReminders
      .filter(r => r.lead_minutes !== '')
      .map(r => ({ lead_minutes: parseInt(r.lead_minutes, 10), message: r.message.trim() || null }));
    const duplicateLead = findDuplicateLeadMinutes(reminderRows);
    if (duplicateLead !== null) {
      alert(`A reminder for ${duplicateLead} minute(s) before showtime is configured more than once — each lead time can only be used once.`);
      return;
    }

    setSubmitting(true);
    try {
      const shiftlessPayload = {
        is_shiftless:       formData.is_shiftless,
        shiftless_capacity: formData.shiftless_capacity ? parseInt(formData.shiftless_capacity) : null,
      };
      const rolePayload = {
        attendee_enabled:   formData.attendee_enabled,
        attendee_capacity:  formData.attendee_capacity ? parseInt(formData.attendee_capacity) : null,
        speaker_enabled:    formData.speaker_enabled,
        panels_enabled:     formData.panels_enabled,
      };
      const showtimePayload = {
        discord_showtime_webhook_url: formData.discord_showtime_webhook_url.trim() || null,
      };
      const imageUrl = formData.image_url || organizationLogoUrl || '';
      if (event) {
        const { error } = await supabase
          .from('events')
          .update({ ...formData, image_url: imageUrl, end_date: formData.end_date || null, ...shiftlessPayload, ...rolePayload, ...showtimePayload })
          .eq('id', event.id);
        if (error) throw error;
        await saveDayHours(event.id, dayHoursResult.rows);
        const { error: reminderError } = await saveShowtimeReminders(supabase, 'event_id', event.id, reminderRows);
        if (reminderError) alert(`Event saved, but reminders could not be updated: ${reminderError}`);

        if (applyToSeries && event.series_id) {
          const res = await fetch(`/api/events/${event.id}/recur`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title:        formData.title,
              description:  formData.description,
              location:     formData.location,
              time:         formData.time || '',
              image_url:    imageUrl,
              event_format: formData.event_format,
              online_url:   formData.online_url || null,
            }),
          });
          if (!res.ok) {
            const resBody = await res.json().catch(() => ({}));
            alert(`Event saved, but couldn't update other occurrences: ${resBody.error ?? 'unknown error'}`);
          }
        }
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: newEvent, error } = await supabase
          .from('events')
          .insert({
            event_id:      formData.event_id,
            title:         formData.title,
            date:          formData.date,
            end_date:      formData.end_date || null,
            time:          formData.time || '',
            location:      formData.location,
            description:   formData.description,
            image_url:     imageUrl,
            status:        formData.status,
            event_format:  formData.event_format,
            online_url:    formData.online_url || null,
            recording_url: formData.recording_url || null,
            organization_id: organizationId,
            primary_owner_id: user?.id ?? null,
            ...shiftlessPayload,
            ...rolePayload,
            ...showtimePayload,
          })
          .select('id')
          .single();
        if (error) throw error;
        await saveDayHours(newEvent.id, dayHoursResult.rows);
        const { error: reminderError } = await saveShowtimeReminders(supabase, 'event_id', newEvent.id, reminderRows);
        if (reminderError) alert(`Event saved, but reminders could not be updated: ${reminderError}`);
      }
      onSave();
    } catch (error) {
      alert('Error saving event: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const scheduleDays = getEventDays(formData.date, isMultiDay ? formData.end_date : formData.date);
  // A day's hours can land outside scheduleDays after timezone conversion
  // (an edge case near midnight) -- rather than silently dropping them,
  // show them as extra, clearly labeled rows so nothing is lost unnoticed.
  const extraDayHourDays = Object.keys(dayHours).filter(d => !scheduleDays.includes(d)).sort();
  const allDayHourDays = [...scheduleDays, ...extraDayHourDays];

  return (
    <FloatingWindow title={event ? 'Edit Event' : 'Create Event'} onClose={onClose} maxWidthClassName="max-w-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {event && (
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-500 dark:text-gray-400">Event ID (URL slug)</label>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm text-gray-600 dark:text-gray-400 font-mono truncate">{formData.event_id}</code>
                  <button
                    type="button"
                    onClick={copySlug}
                    className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors shrink-0"
                  >
                    {slugCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {slugCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            <div>
              <div className="flex items-baseline justify-between mb-1">
                <label className="block text-sm font-medium">
                  Title <span className="text-red-500">*</span>
                </label>
                <span className="text-xs text-gray-400">{formData.title.length}/{TITLE_MAX}</span>
              </div>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleTitleChange(e.target.value.slice(0, TITLE_MAX))}
                maxLength={TITLE_MAX}
                className={inputCls}
              />
              {errors.title
                ? <p className="text-red-600 text-sm mt-1">{errors.title}</p>
                : <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Max {TITLE_MAX} characters</p>
              }
            </div>

            <div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Date <span className="text-red-500">*</span>
                </label>
                <ShiftDatePicker
                  value={formData.date}
                  onChange={(d) => setFormData({ ...formData, date: d })}
                  disabled={hasVolunteers}
                />
                {hasVolunteers
                  ? <p className="text-xs text-gray-400 mt-1">Date cannot be changed — volunteers are registered</p>
                  : errors.date && <p className="text-red-600 text-sm mt-1">{errors.date}</p>
                }
                <div className="mt-2">
                  {isPaid ? (
                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none text-gray-600 dark:text-gray-400">
                      <input
                        type="checkbox"
                        checked={isMultiDay}
                        disabled={hasVolunteers}
                        onChange={(e) => {
                          setIsMultiDay(e.target.checked);
                          if (e.target.checked && formData.date) {
                            const next = new Date(formData.date + 'T00:00:00');
                            next.setDate(next.getDate() + 1);
                            setFormData(prev => ({ ...prev, end_date: next.toISOString().split('T')[0] }));
                          } else if (!e.target.checked) {
                            setFormData(prev => ({
                              ...prev,
                              end_date: '',
                              status: prev.status === 'ongoing' ? 'active' : prev.status,
                            }));
                          }
                        }}
                        className="rounded"
                      />
                      Multi-day event
                    </label>
                  ) : (
                    <p className="text-xs text-gray-400">Multi-day events require a paid plan</p>
                  )}
                  {isPaid && isMultiDay && (
                    <div className="mt-2">
                      <label className="block text-sm font-medium mb-1">End Date</label>
                      <ShiftDatePicker
                        value={formData.end_date}
                        onChange={(d) => setFormData({ ...formData, end_date: d })}
                        minDate={formData.date ? (() => { const d = new Date(formData.date + 'T00:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })() : undefined}
                        disabled={hasVolunteers}
                      />
                      {errors.end_date && <p className="text-red-600 text-sm mt-1">{errors.end_date}</p>}
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Event Hours / Daily Schedule */}
            {allDayHourDays.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  {isMultiDay ? 'Daily Schedule (optional)' : 'Event Hours (optional)'}
                </label>
                <div className="space-y-2">
                  {allDayHourDays.map(day => {
                    const isExtra = !scheduleDays.includes(day);
                    const d = new Date(day + 'T00:00:00');
                    const label = (isMultiDay || isExtra)
                      ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
                      : null;
                    const targetDate = dayHours[day]?.start_time
                      ? convertWallClock(day, dayHours[day].start_time, personalTimezone, organizationTimezone)?.date
                      : undefined;
                    return (
                      <div key={day}>
                        {isExtra && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mb-1">
                            ⚠ Outside the event&apos;s dates — shown because its hours convert to this day in your timezone. Adjust or clear it below.
                          </p>
                        )}
                        <div className="flex items-center gap-3">
                          {label && (
                            <span className="text-sm text-gray-600 dark:text-gray-400 w-28 shrink-0">{label}</span>
                          )}
                          <div className="flex items-center gap-2 flex-1">
                            <div className="flex-1">
                              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Opens</label>
                              <input
                                type="time"
                                value={dayHours[day]?.start_time || ''}
                                onChange={(e) => setDayHours(prev => ({ ...prev, [day]: { ...prev[day], start_time: e.target.value } }))}
                                className={timeInputCls + ' w-full'}
                              />
                            </div>
                            <span className="text-gray-400 mt-4">–</span>
                            <div className="flex-1">
                              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Closes</label>
                              <input
                                type="time"
                                value={dayHours[day]?.end_time || ''}
                                onChange={(e) => setDayHours(prev => ({ ...prev, [day]: { ...prev[day], end_time: e.target.value } }))}
                                className={timeInputCls + ' w-full'}
                              />
                            </div>
                          </div>
                        </div>
                        <TimezoneShiftNotice originalDate={day} shiftedDate={targetDate} timezoneLabel={organizationTimezone || 'UTC'} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">
                Location {locationRequired && <span className="text-red-500">*</span>}
              </label>
              <LocationAutocomplete
                value={formData.location}
                onChange={(location) => setFormData({ ...formData, location })}
                disabled={submitting}
                placeholder="Start typing an address or venue..."
                className={inputCls}
              />
              {errors.location && <p className="text-red-600 text-sm mt-1">{errors.location}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Event Format</label>
              <div className="flex gap-2">
                {[['in_person', 'In Person'], ['online', 'Online'], ['hybrid', 'Hybrid']].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setFormData({ ...formData, event_format: val })}
                    className={`flex-1 py-2 rounded-md text-sm font-medium border transition-colors ${
                      formData.event_format === val
                        ? 'bg-gradient-to-br from-blue-600 to-purple-600 text-white border-transparent'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {(formData.event_format === 'online' || formData.event_format === 'hybrid') && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Online URL (Zoom, livestream, etc.)
                </label>
                <input
                  type="url"
                  value={formData.online_url}
                  onChange={(e) => setFormData({ ...formData, online_url: e.target.value })}
                  className={inputCls}
                  placeholder="https://zoom.us/j/..."
                />
                {!formData.online_url.trim() && (
                  <p className="text-amber-600 text-sm mt-1">
                    No link yet? That&apos;s fine — you can add it later, but attendees won&apos;t be able to join until you do.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Description (optional)</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className={inputCls}
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Banner Image (optional)</label>
              <EventImageUploader
                value={formData.image_url}
                onChange={(url) => setFormData({ ...formData, image_url: url })}
                organizationId={organizationId}
                orgLogoUrl={organizationLogoUrl}
                disabled={submitting}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Recording URL (optional — add after the event)</label>
              <input
                type="url"
                value={formData.recording_url}
                onChange={(e) => setFormData({ ...formData, recording_url: e.target.value })}
                className={inputCls}
                placeholder="https://youtube.com/watch?v=..."
              />
            </div>

            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium flex items-center gap-1.5">
                Discord Showtime Ping (optional)
                <HelpButton title="Setting up a Discord webhook">
                  <ol className="list-decimal list-inside space-y-1.5">
                    <li>In Discord, open the server and channel you want the ping posted to.</li>
                    <li>Right-click the channel (or click its gear icon) and choose <strong>Edit Channel</strong>.</li>
                    <li>Go to <strong>Integrations → Webhooks</strong>, then click <strong>New Webhook</strong>.</li>
                    <li>Optionally give it a name (e.g. &quot;Showtime Bot&quot;), then click <strong>Copy Webhook URL</strong>.</li>
                    <li>Paste that URL into the field below.</li>
                  </ol>
                  <p>
                    That URL is what determines the channel — there&apos;s nothing else to configure on the Discord
                    side. Once it&apos;s set, the ping posts automatically the chosen number of minutes before
                    showtime; no further action is needed.
                  </p>
                </HelpButton>
              </p>
              <p className="text-xs text-gray-500">
                Posts a reminder to a Discord channel shortly before this event starts. Create an incoming webhook
                in the target channel&apos;s Discord settings (Channel Settings → Integrations → Webhooks) and
                paste the URL below — that&apos;s how the channel is chosen. Panels are independent: a panel only
                pings if it sets its own webhook, and won&apos;t use this one.
              </p>
              {/* password, not url, while streaming -- a webhook URL is a bearer
                  secret (anyone holding it can post into the channel), same
                  class of value as the API keys in org settings, so it gets
                  masked on-screen the same way a password field would. */}
              <input
                type={streamerMode ? 'password' : 'url'}
                value={formData.discord_showtime_webhook_url}
                onChange={(e) => setFormData({ ...formData, discord_showtime_webhook_url: e.target.value })}
                className={inputCls}
                placeholder="https://discord.com/api/webhooks/..."
              />
              <ShowtimeReminderList reminders={showtimeReminders} onChange={setShowtimeReminders} name={formData.title} />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={formData.is_shiftless}
                  disabled={hasShifts}
                  onChange={(e) => setFormData({ ...formData, is_shiftless: e.target.checked, shiftless_capacity: '' })}
                  className="rounded"
                />
                Shiftless event (volunteers register without selecting a time slot)
              </label>
              {hasShifts && (
                <p className="text-xs text-gray-400 mt-1">Cannot enable — this event already has shifts</p>
              )}
            </div>

            {formData.is_shiftless && (
              <div>
                <label className="block text-sm font-medium mb-1">Capacity (optional)</label>
                <input
                  type="number"
                  value={formData.shiftless_capacity}
                  onChange={(e) => setFormData({ ...formData, shiftless_capacity: e.target.value })}
                  className={inputCls}
                  placeholder="Leave blank for unlimited"
                  min={0}
                />
              </div>
            )}

            <div>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={formData.attendee_enabled}
                  onChange={(e) => setFormData({ ...formData, attendee_enabled: e.target.checked, attendee_capacity: '' })}
                  className="rounded"
                />
                Enable Attendee registration (RSVP, no shift selection)
              </label>
            </div>

            {formData.attendee_enabled && (
              <div>
                <label className="block text-sm font-medium mb-1">Attendee Capacity (optional)</label>
                <input
                  type="number"
                  value={formData.attendee_capacity}
                  onChange={(e) => setFormData({ ...formData, attendee_capacity: e.target.value })}
                  className={inputCls}
                  placeholder="Leave blank for unlimited"
                  min={0}
                />
              </div>
            )}

            <div>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={formData.speaker_enabled}
                  onChange={(e) => setFormData({ ...formData, speaker_enabled: e.target.checked })}
                  className="rounded"
                />
                Enable Speaker signups (invite-only)
              </label>
              {formData.speaker_enabled && event && (
                <p className="text-xs text-gray-400 mt-1">
                  Manage speaker invites from the &quot;Speakers&quot; tab after saving.
                </p>
              )}
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={formData.panels_enabled}
                  onChange={(e) => setFormData({ ...formData, panels_enabled: e.target.checked })}
                  className="rounded"
                />
                Enable Panels (scheduled sessions with their own attendees, speakers, and staff)
              </label>
              {formData.panels_enabled && event && (
                <p className="text-xs text-gray-400 mt-1">
                  Manage panels from the &quot;Panels&quot; tab after saving.
                </p>
              )}
            </div>

            {event && (
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className={inputCls}
                >
                  <option value="active">Active</option>
                  {isMultiDay && <option value="ongoing">Ongoing</option>}
                  <option value="cancelled">Cancelled</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            )}

            {event?.series_id && (
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none text-gray-600 dark:text-gray-400 pt-2">
                <input
                  type="checkbox"
                  checked={applyToSeries}
                  onChange={(e) => setApplyToSeries(e.target.checked)}
                  className="rounded"
                />
                Apply title, description, location, time, image, and format changes to all other upcoming occurrences in this series
              </label>
            )}

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="flex-1 bg-gradient-to-br from-blue-600 to-purple-600 hover:opacity-90">
                {submitting ? 'Saving...' : event ? 'Update Event' : 'Create Event'}
              </Button>
            </div>
          </form>
    </FloatingWindow>
  );
}
