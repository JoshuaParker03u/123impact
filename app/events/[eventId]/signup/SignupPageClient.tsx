'use client'

import { useState, useEffect } from 'react'
import { use } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import { getBrowserClient } from '@/lib/supabase'
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
  attendee_enabled?: boolean
  attendee_capacity?: number | null
  attendee_filled?: number
  speaker_enabled?: boolean
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

type BrandingData = { primary_color: string | null; secondary_color: string | null; banner_image_url: string | null; header_links: { label: string; url: string }[]; org_name: string | null; org_logo: string | null }

type Role = 'volunteer' | 'attendee' | 'speaker'

const ROLE_LABEL: Record<Role, string> = {
  volunteer: 'Volunteer',
  attendee:  'Attendee',
  speaker:   'Speaker',
}

const ROLE_TAGLINE: Record<Role, string> = {
  volunteer: "You're signing up to volunteer for this event.",
  attendee:  "You're RSVPing to attend this event.",
  speaker:   "You're confirming your speaking slot for this event.",
}

export default function SignupPageClient({ params, initialBranding, role }: { params: Promise<{ eventId: string }>; initialBranding: BrandingData | null; role: Role }) {
  const { eventId } = use(params)
  const searchParams = useSearchParams()
  const refToken = searchParams.get('ref')
  const inviteToken = searchParams.get('token')

  const [event, setEvent]                 = useState<Event | null>(null)
  const [shifts, setShifts]               = useState<Shift[]>([])
  const [coSponsors, setCoSponsors]       = useState<{ id: string; name: string; logo_url: string | null }[]>([])
  const [loading, setLoading]             = useState(true)
  const [pageError, setPageError]         = useState<string | null>(null)
  const branding = initialBranding
  const [selectedShifts, setSelectedShifts] = useState<Set<string>>(new Set())
  const [formData, setFormData]             = useState({ name: '', email: '', phone: '', bio: '', topic: '' })
  const [submitted, setSubmitted]           = useState(false)
  const [submittedShifts, setSubmittedShifts] = useState<{ id: string; name: string; start_time: string; end_time: string; waitlisted: boolean }[]>([])
  const [submitting, setSubmitting]         = useState(false)
  const [errors, setErrors]                 = useState<Record<string, string>>({})
  const [inviteError, setInviteError]       = useState<string | null>(null)
  // True when the inviter already specified a topic — locks the field so
  // the invitee isn't asked to fill it in themselves. False for legacy
  // invites created before topics were set at invite time.
  const [topicLocked, setTopicLocked]       = useState(false)
  const [sessionTime, setSessionTime]       = useState<string | null>(null)

  // Compare plain "YYYY-MM-DD" strings directly rather than through Date
  // objects — new Date("2026-07-28") parses as UTC midnight, which shifts a
  // day earlier than local midnight in timezones behind UTC and closed
  // registration a day too soon.
  const isPast = (() => {
    if (!event) return false
    const eventEndDateStr = event.end_date ?? event.date
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    return eventEndDateStr < todayStr
  })()
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

        if (role === 'volunteer') {
          // GET /api/events/:id/shifts  — public
          const shiftsData = await apiFetch<Shift[]>(`events/${eventData.id}/shifts`)
          setShifts(shiftsData)
        }

        // Fetch co-sponsors (fire-and-forget, non-blocking)
        fetch(`/api/events/${eventData.id}/co-sponsors`)
          .then(r => r.ok ? r.json() : [])
          .then(setCoSponsors)
          .catch(() => {})


        // Record anonymous QR scan if a ref token is present
        if (refToken) {
          fetch('/api/qr/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ref_token: refToken, event_id: eventData.id }),
          }).catch(() => {}) // fire-and-forget, never block registration
        }

        // Speaker signup is invite-only — validate the token and lock the
        // email to whoever was invited (no account/login involved).
        if (role === 'speaker') {
          if (!inviteToken) {
            setInviteError('This link is missing an invitation token.')
          } else {
            const res = await fetch(`/api/event-speaker-invites/${inviteToken}`)
            const data = await res.json()
            if (!res.ok) {
              setInviteError(data.error ?? 'Invalid invitation link')
            } else if (data.status !== 'pending') {
              setInviteError(
                data.status === 'accepted' ? 'This invitation has already been used.' :
                data.status === 'expired'  ? 'This invitation has expired.' :
                'This invitation is no longer valid.'
              )
            } else {
              setFormData(prev => ({
                ...prev,
                email: data.email,
                name:  prev.name || data.prefill?.name || prev.name,
                phone: prev.phone || data.prefill?.phone || prev.phone,
                bio:   prev.bio || data.prefill?.bio || prev.bio,
                topic: data.topic || prev.topic,
              }))
              setTopicLocked(!!data.topic)
              setSessionTime(data.session_time ?? null)
            }
          }
        }
      } catch (err) {
        setPageError(err instanceof Error ? err.message : 'Failed to load event')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [eventId, role, inviteToken])

  // ── Pre-fill form for logged-in users ───────────────────────────────────────
  // Speaker is excluded: its email/name/phone/bio come from the invite's
  // email server-side (see the load() effect above), not from whoever
  // happens to be logged into this browser. Using the logged-in session here
  // too would (a) require sign-in, which Speaker signup explicitly doesn't,
  // and (b) silently fill in the wrong person's data if the visitor is
  // logged in as an account other than the one that was invited.

  useEffect(() => {
    if (role === 'speaker') return

    async function prefill() {
      const { data: { user } } = await getBrowserClient().auth.getUser()
      if (!user) return

      try {
        const res = await fetch('/api/users/me')
        if (!res.ok) return
        const profile = await res.json()
        setFormData(prev => ({
          ...prev,
          name: prev.name || profile.full_name || prev.name,
          email: prev.email || profile.email || prev.email,
          phone: prev.phone || profile.phone || prev.phone,
        }))
      } catch {}
    }

    prefill()
  }, [role])

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

  // Only Volunteer signups (on events that aren't shiftless) pick a shift —
  // Attendee/Speaker are always RSVP-style.
  const requiresShift = role === 'volunteer' && !event?.is_shiftless

  // ── Validation ───────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const next: Record<string, string> = {}

    if (!formData.name.trim())
      next.name = 'Name is required'

    if (role !== 'speaker') {
      if (!formData.email.trim())
        next.email = 'Email is required'
      else if (!/\S+@\S+\.\S+/.test(formData.email))
        next.email = 'Email is invalid'
    }

    if (formData.phone.trim() && !/^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/.test(formData.phone))
      next.phone = 'Phone number format is invalid (e.g., 555-123-4567)'

    if (requiresShift && selectedShifts.size === 0)
      next.shift = 'Please select at least one shift'

    setErrors(next)
    return Object.keys(next).length === 0
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate() || (requiresShift && selectedShifts.size === 0) || !event) return

    setSubmitting(true)
    setErrors({})

    try {
      if (role === 'speaker') {
        const res = await fetch(`/api/event-speaker-invites/${inviteToken}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name:  formData.name,
            phone: formData.phone.trim() || null,
            bio:   formData.bio.trim() || null,
            topic: formData.topic.trim() || null,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
        setSubmittedShifts([])
      } else if (role === 'attendee' || event.is_shiftless) {
        const payload = {
          event_id:      event.id,
          name:          formData.name,
          email:         formData.email.toLowerCase(),
          phone:         formData.phone.trim() || null,
          attendee_type: role,
        }
        await apiFetch('volunteer-registrations', { method: 'POST', body: JSON.stringify(payload) })
        setSubmittedShifts([])
      } else {
        const payload = {
          name:          formData.name,
          email:         formData.email.toLowerCase(),
          phone:         formData.phone.trim() || null,
          attendee_type: role,
          shift_ids:     [...selectedShifts],
        }
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

  // ── Invalid/expired speaker invite ──────────────────────────────────────

  if (role === 'speaker' && inviteError) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
          <div className="max-w-4xl mx-auto">
            <Card className="p-8 text-center">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Invitation Not Valid</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-6">{inviteError}</p>
            </Card>
          </div>
        </main>
      </>
    )
  }

  // ── Success ──────────────────────────────────────────────────────────────

  const accentColor    = branding?.primary_color ?? null
  const secondaryColor = branding?.secondary_color ?? null
  const btnStyle = accentColor
    ? { background: `linear-gradient(to right, ${accentColor}, ${secondaryColor ?? accentColor})`, border: 'none' }
    : undefined
  const accentStyle = accentColor ? { backgroundColor: accentColor } : undefined

  if (submitted) {
    const anyWaitlisted = submittedShifts.some(s => s.waitlisted)
    const allWaitlisted = submittedShifts.length > 0 && submittedShifts.every(s => s.waitlisted)
    const isShiftless   = role !== 'volunteer' || event.is_shiftless

    return (
      <>
        {branding ? (
          <header className="border-b bg-white dark:bg-gray-900 dark:border-gray-800">
            <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {branding.org_logo
                  ? <img src={branding.org_logo} alt={branding.org_name ?? ''} className="h-8 w-auto object-contain" />
                  : branding.org_name && <span className="font-bold text-gray-900 dark:text-gray-100">{branding.org_name}</span>}
              </div>
              {branding.header_links.length > 0 && (
                <nav className="flex items-center gap-4">
                  {branding.header_links.map((link, i) => (
                    <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">{link.label}</a>
                  ))}
                </nav>
              )}
            </div>
          </header>
        ) : <Header />}
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
                {allWaitlisted ? "You're on the Waitlist!" : role === 'speaker' ? "You're Confirmed to Speak!" : "You're All Set!"}
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
                    <div key={s.id}
                      className={`rounded-lg p-4 border ${s.waitlisted ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700' : 'bg-blue-50 dark:bg-blue-900/30'}`}
                      style={!s.waitlisted && accentColor ? { borderColor: accentColor } : undefined}
                    >
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
                  ? { background: `linear-gradient(to right, ${accentColor}, ${secondaryColor ?? accentColor + '99'})` }
                  : {}),
              }}
            />
            <div className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide text-white"
                  style={btnStyle ?? { background: 'linear-gradient(to right, #2563eb, #9333ea)' }}
                >
                  {ROLE_LABEL[role]} Sign-Up
                </span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">{event.title}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{ROLE_TAGLINE[role]}</p>
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
                          <div className="w-7 h-7 rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0"
                            style={btnStyle ?? { background: 'linear-gradient(to bottom right, #3b82f6, #9333ea)' }}>
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
                              <div className="w-7 h-7 rounded-md flex items-center justify-center text-white text-xs font-bold"
                                style={btnStyle ?? { background: 'linear-gradient(to bottom right, #3b82f6, #9333ea)' }}>
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

          {/* Shift selection — only for Volunteer signups on non-shiftless events */}
          {role === 'attendee' ? (
            event.attendee_capacity ? (
              <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-3">
                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                <p className="text-sm text-blue-900 dark:text-blue-200">
                  {Math.max(0, event.attendee_capacity - (event.attendee_filled ?? 0))} of {event.attendee_capacity} spots remaining
                </p>
              </div>
            ) : null
          ) : role === 'speaker' ? null : event.is_shiftless ? (
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
                          : 'bg-blue-50 dark:bg-blue-900/30'
                        : isDisabled
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:shadow-lg cursor-pointer'
                    }`}
                    style={isSelected && !isWaitlistable
                      ? { outline: `2px solid ${accentColor ?? '#2563eb'}`, outlineOffset: '-2px' }
                      : undefined}
                    onClick={() => !isDisabled && toggleShift(shift)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{shift.name}</h3>
                          {isSelected && (
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center ${isWaitlistable ? 'bg-amber-500' : 'bg-blue-600'}`}
                              style={!isWaitlistable && accentStyle ? accentStyle : undefined}
                            >
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
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">{ROLE_LABEL[role]} Information</h2>
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
                  disabled={submitting || role === 'speaker'}
                />
                {role === 'speaker' && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">This invitation is tied to your invited email.</p>
                )}
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
                {role === 'volunteer' && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Get SMS reminders for your shift (feature coming soon!)
                  </p>
                )}
              </div>

              {role === 'speaker' && (
                <>
                  <div>
                    <Label htmlFor="topic">Session Topic{topicLocked ? '' : ' (optional)'}</Label>
                    <Input
                      id="topic"
                      value={formData.topic}
                      onChange={(e) => handleInputChange('topic', e.target.value)}
                      placeholder="What will you be speaking about?"
                      disabled={submitting || topicLocked}
                    />
                    {topicLocked && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">This topic was set by the event organizer.</p>
                    )}
                    {sessionTime && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Scheduled for {formatEventTime(sessionTime)}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="bio">Speaker Bio (optional)</Label>
                    <textarea
                      id="bio"
                      value={formData.bio}
                      onChange={(e) => handleInputChange('bio', e.target.value)}
                      placeholder="A short bio for the event program"
                      disabled={submitting}
                      rows={3}
                      className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                    />
                  </div>
                </>
              )}

              <Button
                type="submit"
                className="w-full hover:shadow-lg"
                style={btnStyle ?? { background: 'linear-gradient(to right, #2563eb, #9333ea)' }}
                size="lg"
                disabled={submitting || isClosed}
              >
                {submitting
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</>
                  : isCancelled ? 'Event Cancelled' : isClosed ? 'Registration Closed' : `Confirm ${ROLE_LABEL[role]} Sign-Up`
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