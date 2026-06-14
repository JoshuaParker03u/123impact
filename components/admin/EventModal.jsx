'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import ShiftDatePicker from './ShiftDatePicker';
import LocationAutocomplete from './LocationAutocomplete';
import { X, Upload, Link as LinkIcon } from 'lucide-react';

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

export default function EventModal({ event, organizationId, organizationLogoUrl = null, onClose, onSave, supabase, isPaid = false }) {
  const [slugSuffix] = useState(() => randomSuffix());
  const [slugEdited, setSlugEdited] = useState(false);
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
  });
  const [isMultiDay, setIsMultiDay] = useState(!!event?.end_date);
  const [dayHours, setDayHours] = useState(() =>
    (event?.event_day_hours ?? []).reduce((acc, r) => {
      acc[r.event_date] = { start_time: r.start_time, end_time: r.end_time };
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

  const locationRequired = formData.event_format !== 'online';
  const onlineUrlRequired = formData.event_format === 'online' || formData.event_format === 'hybrid';

  const validate = () => {
    const newErrors = {};
    if (!formData.title.trim()) newErrors.title = 'Title is required';
    if (!formData.date) newErrors.date = 'Date is required';
    if (formData.end_date && formData.end_date < formData.date) newErrors.end_date = 'End date must be on or after start date';
    if (locationRequired && !formData.location.trim()) newErrors.location = 'Location is required';
    if (onlineUrlRequired && !formData.online_url.trim()) newErrors.online_url = 'Online URL is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const saveDayHours = async (eventId) => {
    const days = getEventDays(formData.date, formData.end_date || formData.date);
    const rows = days
      .filter(d => dayHours[d]?.start_time && dayHours[d]?.end_time)
      .map(d => ({ event_id: eventId, event_date: d, start_time: dayHours[d].start_time, end_time: dayHours[d].end_time }));

    if (rows.length > 0) {
      await supabase.from('event_day_hours').upsert(rows, { onConflict: 'event_id,event_date' });
    }
    // Remove rows for days no longer in range
    if (days.length > 0) {
      await supabase.from('event_day_hours').delete().eq('event_id', eventId)
        .not('event_date', 'in', `(${days.map(d => `"${d}"`).join(',')})`);
    } else {
      await supabase.from('event_day_hours').delete().eq('event_id', eventId);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const shiftlessPayload = {
        is_shiftless:       formData.is_shiftless,
        shiftless_capacity: formData.shiftless_capacity ? parseInt(formData.shiftless_capacity) : null,
      };
      const imageUrl = formData.image_url || organizationLogoUrl || '';
      if (event) {
        const { error } = await supabase
          .from('events')
          .update({ ...formData, image_url: imageUrl, end_date: formData.end_date || null, ...shiftlessPayload })
          .eq('id', event.id);
        if (error) throw error;
        await saveDayHours(event.id);
      } else {
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
            ...shiftlessPayload,
          })
          .select('id')
          .single();
        if (error) throw error;
        await saveDayHours(newEvent.id);
      }
      onSave();
    } catch (error) {
      alert('Error saving event: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const scheduleDays = getEventDays(formData.date, isMultiDay ? formData.end_date : formData.date);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">{event ? 'Edit Event' : 'Create Event'}</h2>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X className="w-6 h-6" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {event && (
              <div>
                <label className="block text-sm font-medium mb-1">Event ID (URL slug)</label>
                <input
                  type="text"
                  value={formData.event_id}
                  className="w-full border rounded-md px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 cursor-not-allowed"
                  disabled
                />
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
            {scheduleDays.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  {isMultiDay ? 'Daily Schedule (optional)' : 'Event Hours (optional)'}
                </label>
                <div className="space-y-2">
                  {scheduleDays.map(day => {
                    const d = new Date(day + 'T00:00:00');
                    const label = isMultiDay
                      ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
                      : null;
                    return (
                      <div key={day} className="flex items-center gap-3">
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
                        ? 'bg-blue-600 text-white border-blue-600'
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
                  Online URL (Zoom, livestream, etc.) <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={formData.online_url}
                  onChange={(e) => setFormData({ ...formData, online_url: e.target.value })}
                  className={inputCls}
                  placeholder="https://zoom.us/j/..."
                />
                {errors.online_url && <p className="text-red-600 text-sm mt-1">{errors.online_url}</p>}
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
              <label className="block text-sm font-medium mb-1">Image (optional)</label>
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
                  min={1}
                />
              </div>
            )}

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

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="flex-1 bg-gradient-to-br from-blue-600 to-purple-600 hover:opacity-90">
                {submitting ? 'Saving...' : event ? 'Update Event' : 'Create Event'}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
