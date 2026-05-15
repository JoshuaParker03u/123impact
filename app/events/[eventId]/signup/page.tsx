'use client'

import { useState, useEffect } from 'react'
import { use } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Calendar, MapPin, Users, Clock, Check, Loader2, AlertCircle } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

function formatEventTime(time: string | undefined): string {
  if (!time) return '';
  const match = time.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = match[2];
    const p = h < 12 ? 'AM' : 'PM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${m} ${p}`;
  }
  return time;
}

type DayHours = {
  event_date: string
  start_time: string
  end_time: string
}

type Event = {
  id: string
  event_id: string
  title: string
  description: string | null
  date: string
  end_date?: string | null
  time: string
  location: string
  image_url: string | null
  status: string
  event_day_hours?: DayHours[]
  organizations?: { id: string; name: string; logo_url: string | null } | null
  is_shiftless?: boolean
  shiftless_capacity?: number | null
  shiftless_filled?: number
}

function EventScheduleDisplay({ event }: { event: Event }) {
  const hours = [...(event.event_day_hours ?? [])].sort((a, b) => a.event_date.localeCompare(b.event_date))
  if (!hours.length) {
    return (
      <div className="flex items-center gap-2">
        <Clock className="w-5 h-5" />
        <span>{formatEventTime(event.time)}</span>
      </div>
    )
  }
  if (hours.length === 1) {
    return (
      <div className="flex items-center gap-2">
        <Clock className="w-5 h-5" />
        <span>{formatEventTime(hours[0].start_time)} – {formatEventTime(hours[0].end_time)}</span>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-2">
      <Clock className="w-5 h-5 mt-0.5 shrink-0" />
      <div className="space-y-0.5">
        {hours.map(h => (
          <div key={h.event_date} className="text-sm">
            <span className="font-medium w-24 inline-block">
              {new Date(h.event_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              {formatEventTime(h.start_time)} – {formatEventTime(h.end_time)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

type Shift = {
  id: string
  event_id: string
  shift_id: number
  name: string
  description: string | null
  start_time: string
  end_time: string
  shift_date: string | null
  capacity: number
  filled: number
  waitlisted: number
  available: number    // computed by API
  is_full: boolean     // computed by API
  allow_waitlist: boolean
}

function shiftsConflict(a: Shift, b: Shift, eventDate: string): boolean {
  const dateA = a.shift_date ?? eventDate
  const dateB = b.shift_date ?? eventDate
  if (dateA !== dateB) return false
  return a.start_time < b.end_time && a.end_time > b.start_time
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`)
  return json.data as T
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EventSignup({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params)
  const searchParams = useSearchParams()
  const refToken = searchParams.get('ref')

  const [event, setEvent]                 = useState<Event | null>(null)
  const [shifts, setShifts]               = useState<Shift[]>([])
  const [coSponsors, setCoSponsors]       = useState<{ id: string; name: string; logo_url: string | null }[]>([])
  const [loading, setLoading]             = useState(true)
  const [pageError, setPageError]         = useState<string | null>(null)
  const [branding, setBranding]           = useState<{ primary_color: string | null; banner_image_url: string | null; header_links: { label: string; url: string }[]; org_name: string | null; org_logo: string | null } | null>(null)
  const [selectedShifts, setSelectedShifts] = useState<Set<string>>(new Set())
  const [formData, setFormData]             = useState({ name: '', email: '', phone: '', attendee_type: 'volunteer' })
  const [submitted, setSubmitted]           = useState(false)
  const [submittedShifts, setSubmittedShifts] = useState<{ id: string; name: string; start_time: string; end_time: string; waitlisted: boolean }[]>([])
  const [submitting, setSubmitting]         = useState(false)
  const [errors, setErrors]                 = useState<Record<string, string>>({})

  const isPast       = event ? new Date(event.end_date ?? event.date) < new Date(new Date().toDateString()) : false
  const isCancelled  = event?.status === 'cancelled'
  const isClosed     = event ? (!['active', 'ongoing'].includes(event.status) || isPast) : false

  // ── Fetch event + shifts ─────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setPageError(null)

        // GET /api/events/slug/:eventId  — public, no auth or org header needed
        const eventData = await apiFetch<Event>(`events/slug/${eventId}`)
        setEvent(eventData)

        // GET /api/events/:id/shifts  — public
        const shiftsData = await apiFetch<Shift[]>(`events/${eventData.id}/shifts`)
        setShifts(shiftsData)

        // Fetch co-sponsors (fire-and-forget, non-blocking)
        fetch(`/api/events/${eventData.id}/co-sponsors`)
          .then(r => r.ok ? r.json() : [])
          .then(setCoSponsors)
          .catch(() => {})

        // Fetch custom domain branding if on a custom host
        const host = typeof window !== 'undefined' ? window.location.hostname : ''
        const is123impact = host === '123impact.org' || host === 'www.123impact.org' || host === 'localhost' || host.includes('vercel.app')
        if (!is123impact && host) {
          fetch(`/api/custom-domain/branding?host=${encodeURIComponent(host)}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setBranding(data) })
            .catch(() => {})
        }

        // Record anonymous QR scan if a ref token is present
        if (refToken) {
          fetch('/api/qr/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ref_token: refToken, event_id: eventData.id }),
          }).catch(() => {}) // fire-and-forget, never block registration
        }
      } catch (err) {
        setPageError(err instanceof Error ? err.message : 'Failed to load event')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [eventId])

  // ── Toggle shift selection ────────────────────────────────────────────────

  const toggleShift = (shift: Shift) => {
    setSelectedShifts(prev => {
      const next = new Set(prev)
      if (next.has(shift.id)) {
        next.delete(shift.id)
      } else {
        const conflict = shifts.find(s => next.has(s.id) && shiftsConflict(s, shift, event?.date ?? ''))
        if (conflict) return prev
        next.add(shift.id)
      }
      return next
    })
  }

  // ── Validation ───────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const next: Record<string, string> = {}

    if (!formData.name.trim())
      next.name = 'Name is required'

    if (!formData.email.trim())
      next.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(formData.email))
      next.email = 'Email is invalid'

    if (formData.phone.trim() && !/^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/.test(formData.phone))
      next.phone = 'Phone number format is invalid (e.g., 555-123-4567)'

    if (!event?.is_shiftless && selectedShifts.size === 0)
      next.shift = 'Please select at least one shift'

    setErrors(next)
    return Object.keys(next).length === 0
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate() || (!event?.is_shiftless && selectedShifts.size === 0) || !event) return

    setSubmitting(true)
    setErrors({})

    try {
      const payload: Record<string, unknown> = {
        name:          formData.name,
        email:         formData.email.toLowerCase(),
        phone:         formData.phone.trim() || null,
        attendee_type: formData.attendee_type,
      }

      if (event?.is_shiftless) {
        payload.event_id = event.id
        await apiFetch('volunteer-registrations', { method: 'POST', body: JSON.stringify(payload) })
        setSubmittedShifts([])
      } else {
        payload.shift_ids = [...selectedShifts]
        const res = await fetch('/api/volunteer-registrations/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
        setSubmittedShifts(
          data.registrations.map((r: { shiftId: string; shiftName: string; isWaitlisted: boolean }) => {
            const s = shifts.find(sh => sh.id === r.shiftId)!
            return { id: r.shiftId, name: r.shiftName, start_time: s.start_time, end_time: s.end_time, waitlisted: r.isWaitlisted }
          })
        )
      }

      setSubmitted(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit registration.'
      if (message.toLowerCase().includes('already registered')) {
        setErrors({ submit: `You're already registered for one or more of these shifts at "${event?.title}"! See you there!` })
      } else {
        setErrors({ submit: message })
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
          <div className="max-w-4xl mx-auto flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">Loading event details...</p>
            </div>
          </div>
        </main>
      </>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────

  if (pageError || !event) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
          <div className="max-w-4xl mx-auto">
            <Card className="p-8 text-center">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Event Not Found</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {pageError ?? "The event you're looking for doesn't exist or has been removed."}
              </p>
            </Card>
          </div>
        </main>
      </>
    )
  }

  // ── Success ──────────────────────────────────────────────────────────────

  if (submitted) {
    const anyWaitlisted = submittedShifts.some(s => s.waitlisted)
    const allWaitlisted = submittedShifts.length > 0 && submittedShifts.every(s => s.waitlisted)
    const isShiftless   = event.is_shiftless

    return (
      <>
        <Header />
        <main className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
          <div className="max-w-2xl mx-auto">
            <Card className="p-8 text-center">
              {allWaitlisted ? (
                <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Clock className="w-12 h-12 text-amber-600 dark:text-amber-400" />
                </div>
              ) : (
                <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Check className="w-12 h-12 text-green-600 dark:text-green-400" />
                </div>
              )}

              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                {allWaitlisted ? "You're on the Waitlist!" : "You're All Set!"}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {isShiftless
                  ? `You're registered for ${event.title}, ${formData.name}!`
                  : allWaitlisted
                  ? `We've added you to the waitlist, ${formData.name}. The coordinator will reach out if spots become available.`
                  : `Thank you for signing up, ${formData.name}! We've sent a confirmation email to ${formData.email}.`
                }
              </p>

              {submittedShifts.length > 0 && (
                <div className="space-y-2 mb-6 text-left">
                  {submittedShifts.map(s => (
                    <div key={s.id} className={`rounded-lg p-4 border ${
                      s.waitlisted
                        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700'
                        : 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700'
                    }`}>
                      <div className="flex items-center justify-between">
                        <p className={`text-sm font-medium ${s.waitlisted ? 'text-amber-900 dark:text-amber-200' : 'text-blue-900 dark:text-blue-200'}`}>
                          {s.name}
                        </p>
                        {anyWaitlisted && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            s.waitlisted
                              ? 'bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200'
                              : 'bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200'
                          }`}>
                            {s.waitlisted ? 'Waitlisted' : 'Confirmed'}
                          </span>
                        )}
                      </div>
                      <p className={`text-sm ${s.waitlisted ? 'text-amber-700 dark:text-amber-300' : 'text-blue-700 dark:text-blue-300'}`}>
                        {formatEventTime(s.start_time)} – {formatEventTime(s.end_time)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </main>
      </>
    )
  }

  // ── Main form ────────────────────────────────────────────────────────────

  const accentColor = branding?.primary_color ?? null

  return (
    <>
      {branding ? (
        /* Custom domain branded header */
        <header className="border-b bg-white dark:bg-gray-900 dark:border-gray-800">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {branding.org_logo ? (
                <img src={branding.org_logo} alt={branding.org_name ?? ''} className="h-8 w-auto object-contain" />
              ) : branding.org_name ? (
                <span className="font-bold text-gray-900 dark:text-gray-100">{branding.org_name}</span>
              ) : null}
            </div>
            {branding.header_links.length > 0 && (
              <nav className="flex gap-4">
                {branding.header_links.map((link, i) => (
                  <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
                    {link.label}
                  </a>
                ))}
              </nav>
            )}
          </div>
        </header>
      ) : (
        <Header />
      )}
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
        <div className="max-w-4xl mx-auto">

          {/* Event header */}
          <Card className="mb-8 overflow-hidden">
            <div
              className="h-48 bg-gradient-to-r from-blue-500 to-purple-600"
              style={{
                backgroundImage:    branding?.banner_image_url
                  ? `url(${branding.banner_image_url})`
                  : event.image_url
                  ? `url(${event.image_url})`
                  : undefined,
                backgroundSize:     'cover',
                backgroundPosition: 'center',
                ...(accentColor && !branding?.banner_image_url && !event.image_url
                  ? { background: `linear-gradient(to right, ${accentColor}, ${accentColor}99)` }
                  : {}),
              }}
            />
            <div className="p-6">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">{event.title}</h1>
              <div className="flex flex-wrap gap-4 text-gray-600 dark:text-gray-400 mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  <span>{event.end_date && event.end_date !== event.date ? `${event.date} – ${event.end_date}` : event.date}</span>
                </div>
                <EventScheduleDisplay event={event} />
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" /><span>{event.location}</span>
                </div>
              </div>
              <p className="text-gray-700 dark:text-gray-300">{event.description}</p>

              {(event.organizations || coSponsors.length > 0) && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-3">
                  {event.organizations && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Hosted By</p>
                      <div className="flex items-center gap-2">
                        {event.organizations.logo_url ? (
                          <img src={event.organizations.logo_url} alt={event.organizations.name} className="w-7 h-7 rounded-md object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {event.organizations.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{event.organizations.name}</span>
                      </div>
                    </div>
                  )}
                  {coSponsors.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Co-Hosted By</p>
                      <div className="flex flex-wrap gap-3">
                        {coSponsors.map((org) => (
                          <div key={org.id} className="flex items-center gap-2">
                            {org.logo_url ? (
                              <img src={org.logo_url} alt={org.name} className="w-7 h-7 rounded-md object-cover" />
                            ) : (
                              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                                {org.name.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{org.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Shift selection — hidden for shiftless events */}
          {event.is_shiftless ? (
            event.shiftless_capacity ? (
              <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-3">
                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                <p className="text-sm text-blue-900 dark:text-blue-200">
                  {Math.max(0, event.shiftless_capacity - (event.shiftless_filled ?? 0))} of {event.shiftless_capacity} spots remaining
                </p>
              </div>
            ) : null
          ) : (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Choose Your Shift</h2>
            {errors.shift && <p className="text-red-600 text-sm mb-2">{errors.shift}</p>}
            {shifts.length === 0 ? (
              <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-lg font-medium">No shifts available at this time</p>
                <p className="text-sm mt-1">Check back later — shifts will appear here once they're added.</p>
              </div>
            ) : null}
            <div className="grid gap-4">
              {shifts.map((shift) => {
                const isSelected     = selectedShifts.has(shift.id)
                const isWaitlistable = shift.is_full && shift.allow_waitlist
                const isBlocked      = shift.is_full && !shift.allow_waitlist
                const conflictsWith  = !isSelected
                  ? shifts.find(s => selectedShifts.has(s.id) && shiftsConflict(s, shift, event.date))
                  : null
                const isDisabled = isBlocked || !!conflictsWith
                return (
                  <Card
                    key={shift.id}
                    className={`p-6 transition-all ${
                      isSelected
                        ? isWaitlistable
                          ? 'ring-2 ring-amber-500 bg-amber-50 dark:bg-amber-900/20'
                          : 'ring-2 ring-blue-600 bg-blue-50 dark:bg-blue-900/30'
                        : isDisabled
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:shadow-lg cursor-pointer'
                    }`}
                    onClick={() => !isDisabled && toggleShift(shift)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{shift.name}</h3>
                          {isSelected && (
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isWaitlistable ? 'bg-amber-500' : 'bg-blue-600'}`}>
                              <Check className="w-4 h-4 text-white" />
                            </div>
                          )}
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 mb-3">{shift.description}</p>
                        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {formatEventTime(shift.start_time)} – {formatEventTime(shift.end_time)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {isWaitlistable ? 'Waitlist open' : `${shift.available} ${shift.available === 1 ? 'spot' : 'spots'} left`}
                          </span>
                        </div>
                        {conflictsWith && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                            Conflicts with {conflictsWith.name}
                          </p>
                        )}
                      </div>
                      {isBlocked && (
                        <span className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-full">
                          Full
                        </span>
                      )}
                      {isWaitlistable && (
                        <span className="px-3 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-sm font-medium rounded-full">
                          Waitlist
                        </span>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
          )}

          {/* Registration form */}
          <Card className="p-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Your Information</h2>
            {isCancelled ? (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                <p className="text-red-800 dark:text-red-300 text-sm font-medium">
                  This event has been cancelled. Registration is closed.
                </p>
              </div>
            ) : isClosed ? (
              <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <p className="text-amber-800 dark:text-amber-300 text-sm font-medium">
                  This event has already taken place. Registration is closed.
                </p>
              </div>
            ) : null}
            {errors.submit && (
              <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                <p className="text-red-600 dark:text-red-400 text-sm">{errors.submit}</p>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>I am registering as a *</Label>
                <div className="flex gap-2 mt-1">
                  {[['volunteer', 'Volunteer'], ['attendee', 'Attendee'], ['speaker', 'Speaker']].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleInputChange('attendee_type', val)}
                      className={`flex-1 py-2 rounded-md text-sm font-medium border transition-colors ${
                        formData.attendee_type === val
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="John Doe"
                  className={errors.name ? 'border-red-500' : ''}
                  disabled={submitting}
                />
                {errors.name && <p className="text-red-600 text-sm mt-1">{errors.name}</p>}
              </div>

              <div>
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="john@example.com"
                  className={errors.email ? 'border-red-500' : ''}
                  disabled={submitting}
                />
                {errors.email && <p className="text-red-600 text-sm mt-1">{errors.email}</p>}
              </div>

              <div>
                <Label htmlFor="phone">Phone Number (optional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="(555) 123-4567"
                  className={errors.phone ? 'border-red-500' : ''}
                  disabled={submitting}
                />
                {errors.phone && <p className="text-red-600 text-sm mt-1">{errors.phone}</p>}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Get SMS reminders for your shift (feature coming soon!)
                </p>
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-lg"
                size="lg"
                disabled={submitting || isClosed}
              >
                {submitting
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</>
                  : isCancelled ? 'Event Cancelled' : isClosed ? 'Registration Closed' : 'Confirm Signup'
                }
              </Button>
            </form>
          </Card>

          <div className="text-center mt-6 text-gray-500 dark:text-gray-400 text-sm">
            Powered by <span className="font-semibold text-gray-700 dark:text-gray-300">123impact</span>
          </div>
        </div>
      </main>
    </>
  )
}