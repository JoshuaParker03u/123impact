'use client'

import { useState } from 'react'
import { use } from 'react'
import Header from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Calendar, MapPin, Users, Clock, Check } from 'lucide-react'

// Mock event data
const mockEvent = {
  id: 'food-drive-march',
  title: 'Community Food Distribution',
  date: '2025-03-15',
  time: '8:00 AM - 4:00 PM',
  location: 'Community Center, 123 Main St',
  description: 'Join us for our monthly food distribution event. Help us serve families in need by sorting, packing, and distributing groceries to our community.',
  imageUrl: 'https://images.unsplash.com/photo-1593113646773-028c64a8f1b8?w=800',
  shifts: [
    {
      id: 1,
      name: 'Morning Setup',
      startTime: '08:00',
      endTime: '10:00',
      capacity: 8,
      filled: 5,
      description: 'Help set up tables, organize supplies, and prepare the distribution area'
    },
    {
      id: 2,
      name: 'Food Distribution',
      startTime: '10:00',
      endTime: '14:00',
      capacity: 12,
      filled: 8,
      description: 'Assist families with food selection and loading groceries'
    },
    {
      id: 3,
      name: 'Afternoon Cleanup',
      startTime: '14:00',
      endTime: '16:00',
      capacity: 6,
      filled: 3,
      description: 'Break down tables, clean up, and organize remaining supplies'
    }
  ]
}

export default function EventSignup({ params }: { params: Promise<{ eventId: string }> }) {
  const resolvedParams = use(params)
  const [selectedShift, setSelectedShift] = useState<number | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: ''
  })
  const [submitted, setSubmitted] = useState(false)
  const [errors, setErrors] = useState<{[key: string]: string}>({})

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
    
    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone is required'
    } else if (!/^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/.test(formData.phone)) {
      newErrors.phone = 'Phone number is invalid'
    }
    
    if (selectedShift === null) {
      newErrors.shift = 'Please select a shift'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (validateForm()) {
      // TODO: In future tasks, this will save to Supabase
      console.log('Form submitted:', { ...formData, shiftId: selectedShift })
      setSubmitted(true)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  if (submitted) {
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
                  {mockEvent.shifts.find(s => s.id === selectedShift)?.name}
                </p>
                <p className="text-sm text-blue-700">
                  {mockEvent.date} • {mockEvent.shifts.find(s => s.id === selectedShift)?.startTime} - {mockEvent.shifts.find(s => s.id === selectedShift)?.endTime}
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

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Event Header */}
          <Card className="mb-8 overflow-hidden">
            <div className="h-48 bg-gradient-to-r from-blue-500 to-purple-600" 
                 style={{ backgroundImage: `url(${mockEvent.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            <div className="p-6">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">{mockEvent.title}</h1>
              <div className="flex flex-wrap gap-4 text-gray-600 mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  <span>{mockEvent.date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  <span>{mockEvent.time}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  <span>{mockEvent.location}</span>
                </div>
              </div>
              <p className="text-gray-700">{mockEvent.description}</p>
            </div>
          </Card>

          {/* Shift Selection */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Choose Your Shift</h2>
            {errors.shift && <p className="text-red-600 text-sm mb-2">{errors.shift}</p>}
            <div className="grid gap-4">
              {mockEvent.shifts.map((shift) => {
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
                            {shift.startTime} - {shift.endTime}
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
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Full Name *</Label>
                <Input 
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="John Doe"
                  className={errors.name ? 'border-red-500' : ''}
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
                />
                {errors.email && <p className="text-red-600 text-sm mt-1">{errors.email}</p>}
              </div>

              <div>
                <Label htmlFor="phone">Phone Number *</Label>
                <Input 
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="(555) 123-4567"
                  className={errors.phone ? 'border-red-500' : ''}
                />
                {errors.phone && <p className="text-red-600 text-sm mt-1">{errors.phone}</p>}
              </div>

              <Button 
                type="submit"
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-lg"
                size="lg"
              >
                Confirm Signup
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
