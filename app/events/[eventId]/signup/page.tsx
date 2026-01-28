'use client'

import { useState, useEffect } from 'react'
import { use } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Calendar, MapPin, Users, Clock, Check, Loader2, AlertCircle } from 'lucide-react'

type Event = {
  id: string
  event_id: string
  title: string
  description: string | null
  date: string
  time: string
  location: string
  image_url: string | null
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
}

export default function EventSignup({ params }: { params: Promise<{ eventId: string }> }) {
  const resolvedParams = use(params)
  const [event, setEvent] = useState<Event | null>(null)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedShift, setSelectedShift] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: ''
  })
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<{[key: string]: string}>({})

  // Fetch event and shifts from Supabase
  useEffect(() => {
    async function fetchEventData() {
      try {
        setLoading(true)
        setError(null)

        // Fetch event
        const { data: eventData, error: eventError } = await supabase
          .from('events')
          .select('*')
          .eq('event_id', resolvedParams.eventId)
          .single()

        if (eventError) throw eventError
        if (!eventData) throw new Error('Event not found')

        setEvent(eventData)

        // Fetch shifts for this event
        const { data: shiftsData, error: shiftsError } = await supabase
          .from('shifts')
          .select('*')
          .eq('event_id', eventData.id)
          .order('shift_id')

        if (shiftsError) throw shiftsError

        setShifts(shiftsData || [])
      } catch (err) {
        console.error('Error fetching event:', err)
        setError(err instanceof Error ? err.message : 'Failed to load event')
      } finally {
        setLoading(false)
      }
    }

    fetchEventData()
  }, [resolvedParams.eventId])

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {}
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    }
    
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid'
    }
    
    // Phone is optional, but if provided, must be valid format
    if (formData.phone.trim() && !/^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/.test(formData.phone)) {
      newErrors.phone = 'Phone number format is invalid (e.g., 555-123-4567)'
    }
    
    if (selectedShift === null) {
      newErrors.shift = 'Please select a shift'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  
  if (!validateForm() || !selectedShift) return

  setSubmitting(true)
  setErrors({})

  try {
    // Try to insert - let the database constraint handle duplicates
    const { data, error: insertError } = await supabase
      .from('volunteer_registrations')
      .insert({
        shift_id: selectedShift,
        name: formData.name,
        email: formData.email.toLowerCase(), // Normalize email
        phone: formData.phone.trim() || null
      })
      .select()
      .single()

    if (insertError) {
      // Check for unique constraint violation
      if (insertError.code === '23505' || insertError.message?.toLowerCase().includes('duplicate') || insertError.message?.toLowerCase().includes('unique')) {
        // Already registered - show friendly message
        const selectedShiftData = shifts.find(s => s.id === selectedShift)
        setErrors({ 
          submit: `You're already registered for ${selectedShiftData?.name} on ${event.date} at "${event.title}"! See you there!` 
        })
      } else {
        throw insertError
      }
      setSubmitting(false)
      return
    }

    // Update shift filled count
    const selectedShiftData = shifts.find(s => s.id === selectedShift)
    if (selectedShiftData) {
      const { error: updateError } = await supabase
        .from('shifts')
        .update({ filled: selectedShiftData.filled + 1 })
        .eq('id', selectedShift)

      if (updateError) throw updateError
    }

    // Success!
    setSubmitted(true)
  } catch (err) {
    console.error('Error submitting registration:', err)
    setErrors({ submit: 'Failed to submit registration. Please try again.' })
  } finally {
    setSubmitting(false)
  }
}

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  // Loading state
  if (loading) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 py-12 px-4">
          <div className="max-w-4xl mx-auto flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-gray-600">Loading event details...</p>
            </div>
          </div>
        </main>
      </>
    )
  }

  // Error state
  if (error || !event) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 py-12 px-4">
          <div className="max-w-4xl mx-auto">
            <Card className="p-8 text-center">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Event Not Found</h1>
              <p className="text-gray-600 mb-6">
                {error || 'The event you\'re looking for doesn\'t exist or has been removed.'}
              </p>
              <Button onClick={() => window.location.href = '/'}>
                Return Home
              </Button>
            </Card>
          </div>
        </main>
      </>
    )
  }

  // Success/confirmation screen
  if (submitted) {
    const selectedShiftData = shifts.find(s => s.id === selectedShift)
    
    return (
      <>
        <Header />
        <main className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 py-12 px-4">
          <div className="max-w-2xl mx-auto">
            <Card className="p-8 text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-12 h-12 text-green-600" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-4">
                You're All Set!
              </h1>
              <p className="text-gray-600 mb-6">
                Thank you for signing up, {formData.name}! We've sent a confirmation email to {formData.email} with all the details.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-900 font-medium">
                  {selectedShiftData?.name}
                </p>
                <p className="text-sm text-blue-700">
                  {event.date} • {selectedShiftData?.start_time} - {selectedShiftData?.end_time}
                </p>
              </div>
              <p className="text-sm text-gray-500">
                A calendar invite has been added to your email.
              </p>
            </Card>
          </div>
        </main>
      </>
    )
  }

  // Main signup form
  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Event Header */}
          <Card className="mb-8 overflow-hidden">
            <div className="h-48 bg-gradient-to-r from-blue-500 to-purple-600" 
                 style={{ 
                   backgroundImage: event.image_url ? `url(${event.image_url})` : undefined, 
                   backgroundSize: 'cover', 
                   backgroundPosition: 'center' 
                 }} />
            <div className="p-6">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">{event.title}</h1>
              <div className="flex flex-wrap gap-4 text-gray-600 mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  <span>{event.date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  <span>{event.time}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  <span>{event.location}</span>
                </div>
              </div>
              <p className="text-gray-700">{event.description}</p>
            </div>
          </Card>

          {/* Shift Selection */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Choose Your Shift</h2>
            {errors.shift && <p className="text-red-600 text-sm mb-2">{errors.shift}</p>}
            <div className="grid gap-4">
              {shifts.map((shift) => {
                const spotsLeft = shift.capacity - shift.filled
                const isSelected = selectedShift === shift.id
                const isFull = spotsLeft === 0

                return (
                  <Card 
                    key={shift.id}
                    className={`p-6 cursor-pointer transition-all ${
                      isSelected ? 'ring-2 ring-blue-600 bg-blue-50' : 'hover:shadow-lg'
                    } ${isFull ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => !isFull && setSelectedShift(shift.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-semibold text-gray-900">{shift.name}</h3>
                          {isSelected && (
                            <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                              <Check className="w-4 h-4 text-white" />
                            </div>
                          )}
                        </div>
                        <p className="text-gray-600 mb-3">{shift.description}</p>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {shift.start_time} - {shift.end_time}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left
                          </span>
                        </div>
                      </div>
                      {isFull && (
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

          {/* Registration Form */}
          <Card className="p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Your Information</h2>
            {errors.submit && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{errors.submit}</p>
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
                <p className="text-xs text-gray-500 mt-1">
                  Get SMS reminders for your shift (feature coming soon!)
                </p>
              </div>

              <Button 
                type="submit"
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-lg"
                size="lg"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Confirm Signup'
                )}
              </Button>
            </form>
          </Card>

          <div className="text-center mt-6 text-gray-500 text-sm">
            Powered by <span className="font-semibold text-gray-700">123impact</span>
          </div>
        </div>
      </main>
    </>
  )
}
