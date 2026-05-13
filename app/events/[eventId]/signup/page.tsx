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

type Event = {
  id: string
  event_id: string
  title: string
  description: string | null
  date: string
  time: string
  location: string
  image_url: string | null
  status: string
}

type Shift = {
  id: string
  event_id: string
  shift_id: number
  name: string
  description: string | null
  start_time: string
  end_time: string
  capacity: number
  filled: number
  available: number  // computed by API
  is_full: boolean   // computed by API
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
  const [selectedShift, setSelectedShift] = useState<string | null>(null)
  const [formData, setFormData]           = useState({ name: '', email: '', phone: '', attendee_type: 'volunteer' })
  const [submitted, setSubmitted]         = useState(false)
  const [submitting, setSubmitting]       = useState(false)
  const [errors, setErrors]               = useState<Record<string, string>>({})

  const isPast       = event ? new Date(event.date) < new Date(new Date().toDateString()) : false
  const isCancelled  = event?.status === 'cancelled'
  const isClosed     = event ? (event.status !== 'active' || isPast) : false

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

  // ── Auto-select first available shift ────────────────────────────────────

  useEffect(() => {
    if (shifts.length > 0 && selectedShift === null) {
      const first = shifts.find(s => !s.is_full)
      if (first) setSelectedShift(first.id)
    }
  }, [shifts])

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

    if (!selectedShift)
      next.shift = 'Please select a shift'

    setErrors(next)
    return Object.keys(next).length === 0
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate() || !selectedShift || !event) return

    setSubmitting(true)
    setErrors({})

    try {
      // POST /api/volunteer-registrations  — public
      // The API handles: inserting the row, incrementing shift.filled,
      // and scheduling automated emails.
      await apiFetch('volunteer-registrations', {
        method: 'POST',
        body: JSON.stringify({
          shift_id:      selectedShift,
          name:          formData.name,
          email:         formData.email.toLowerCase(),
          phone:         formData.phone.trim() || null,
          attendee_type: formData.attendee_type,
        }),
      })

      setSubmitted(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit registration.'

      // Surface duplicate-registration as a friendly inline message
      if (message.toLowerCase().includes('duplicate') || message.toLowerCase().includes('unique')) {
        const shiftName = shifts.find(s => s.id === selectedShift)?.name
        setErrors({
          submit: `You're already registered for ${shiftName} at "${event?.title}"! See you there!`,
        })
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
              <Button onClick={() => window.location.href = '/'}>Return Home</Button>
            </Card>
          </div>
        </main>
      </>
    )
  }

  // ── Success ──────────────────────────────────────────────────────────────

  if (submitted) {
    const selectedShiftData = shifts.find(s => s.id === selectedShift)
    return (
      <>
        <Header />
        <main className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
          <div className="max-w-2xl mx-auto">
            <Card className="p-8 text-center">
              <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-12 h-12 text-green-600 dark:text-green-400" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">You're All Set!</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Thank you for signing up, {formData.name}! We've sent a confirmation
                email to {formData.email} with all the details.
              </p>
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-900 dark:text-blue-200 font-medium">{selectedShiftData?.name}</p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {event.date} • {selectedShiftData?.start_time} - {selectedShiftData?.end_time}
                </p>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">A calendar invite has been added to your email.</p>
              <Button
                variant="outline"
                onClick={() => window.location.href = '/'}
                className="w-full sm:w-auto"
              >
                Return to Home
              </Button>
            </Card>
          </div>
        </main>
      </>
    )
  }

  // ── Main form ────────────────────────────────────────────────────────────

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
        <div className="max-w-4xl mx-auto">

          {/* Event header */}
          <Card className="mb-8 overflow-hidden">
            <div
              className="h-48 bg-gradient-to-r from-blue-500 to-purple-600"
              style={{
                backgroundImage:    event.image_url ? `url(${event.image_url})` : undefined,
                backgroundSize:     'cover',
                backgroundPosition: 'center',
              }}
            />
            <div className="p-6">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">{event.title}</h1>
              <div className="flex flex-wrap gap-4 text-gray-600 dark:text-gray-400 mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" /><span>{event.date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5" /><span>{event.time}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" /><span>{event.location}</span>
                </div>
              </div>
              <p className="text-gray-700 dark:text-gray-300">{event.description}</p>

              {coSponsors.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
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
          </Card>

          {/* Shift selection */}
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
                const isSelected = selectedShift === shift.id
                return (
                  <Card
                    key={shift.id}
                    className={`p-6 cursor-pointer transition-all ${
                      isSelected ? 'ring-2 ring-blue-600 bg-blue-50 dark:bg-blue-900/30' : 'hover:shadow-lg'
                    } ${shift.is_full ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => !shift.is_full && setSelectedShift(shift.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{shift.name}</h3>
                          {isSelected && (
                            <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                              <Check className="w-4 h-4 text-white" />
                            </div>
                          )}
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 mb-3">{shift.description}</p>
                        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {shift.start_time} - {shift.end_time}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {shift.available} {shift.available === 1 ? 'spot' : 'spots'} left
                          </span>
                        </div>
                      </div>
                      {shift.is_full && (
                        <span className="px-3 py-1 bg-gray-200 text-gray-700 text-sm font-medium rounded-full">
                          Full
                        </span>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>

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