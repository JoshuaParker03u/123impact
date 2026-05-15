import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import AdminNavigation from '@/components/admin/AdminNavigation'
import { Calendar, Users, QrCode, MessageSquare, BarChart3, Shield, ArrowDown } from 'lucide-react'
import LandingTabs from '@/components/LandingTabs'

export default async function Home() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const features = [
    {
      icon: Calendar,
      title: 'Event Management',
      description: 'Create single or multi-day events with custom schedules and public signup pages ready instantly.',
    },
    {
      icon: Users,
      title: 'Shift Scheduling',
      description: 'Define shifts with capacity limits — volunteers self-register and you see fill rates in real time.',
    },
    {
      icon: QrCode,
      title: 'QR Check-In',
      description: 'Generate a QR code for each event so volunteers can check in on the day without any paper.',
    },
    {
      icon: MessageSquare,
      title: 'Volunteer Messaging',
      description: 'Communicate directly with your volunteers — send updates, reminders, and announcements before, during, and after every event.',
    },
    {
      icon: BarChart3,
      title: 'Volunteer Analytics',
      description: 'Track attendance, registration trends, and staffing levels across all your events.',
    },
    {
      icon: Shield,
      title: 'Role-Based Access',
      description: 'Invite event-specific admins without giving them access to your whole organization.',
    },
  ]

  const steps = [
    {
      number: '1',
      title: 'Create your event',
      description: 'Set the date, location, and shifts. Your public signup page is live immediately — no extra setup.',
    },
    {
      number: '2',
      title: 'Volunteers sign up',
      description: 'Share the link. Volunteers register for the shifts that work for them, from any device.',
    },
    {
      number: '3',
      title: 'You stay in control',
      description: 'Monitor fill rates, send updates, and check people in on the day — all from one dashboard.',
    },
  ]

  return (
    <>
      {user ? <AdminNavigation /> : <Header />}

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-gray-50 dark:bg-gray-950 pt-20 pb-24 px-4">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 pointer-events-none" />
          <div className="relative container mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-sm font-medium mb-6">
              Built for nonprofits
            </div>
            <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-gray-900 dark:text-gray-50 mb-6 leading-tight">
              Volunteer Scheduling,{' '}
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Made Simple.
              </span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
              Coordinate events, manage shifts, and engage volunteers — all in one place designed for the organizations that need it most.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/login?mode=signup"
                className="px-8 py-3.5 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold text-base shadow-md hover:opacity-90 transition-opacity"
              >
                Get Started Free
              </Link>
              <a
                href="#how-it-works"
                className="flex items-center gap-2 px-8 py-3.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold text-base hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                See How It Works
                <ArrowDown className="w-4 h-4" />
              </a>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-20 px-4 bg-gray-100 dark:bg-gray-900">
          <div className="container mx-auto max-w-5xl">
            <div className="text-center mb-14">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-50 mb-3">
                Everything you need to run your program
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-lg max-w-xl mx-auto">
                From event creation to day-of check-in, 123impact handles the logistics so you can focus on your mission.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm"
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mb-4">
                    <f.icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1.5">{f.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{f.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <LandingTabs />

        {/* How It Works */}
        <section id="how-it-works" className="py-20 px-4 bg-gray-50 dark:bg-gray-950">
          <div className="container mx-auto max-w-4xl">
            <div className="text-center mb-14">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-50 mb-3">
                Up and running in minutes
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-lg">
                No training required. No IT department needed.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {steps.map((step, i) => (
                <div key={step.number} className="relative text-center">
                  {i < steps.length - 1 && (
                    <div className="hidden md:block absolute top-6 left-[calc(50%+2.5rem)] w-[calc(100%-5rem)] h-px bg-gradient-to-r from-blue-200 to-purple-200 dark:from-blue-800 dark:to-purple-800" />
                  )}
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-white font-bold text-lg flex items-center justify-center mx-auto mb-4 relative z-10">
                    {step.number}
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">{step.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Banner */}
        <section className="py-20 px-4 bg-gradient-to-r from-blue-600 to-purple-600">
          <div className="container mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-white mb-3">
              Ready to streamline your volunteer program?
            </h2>
            <p className="text-blue-100 text-lg mb-8">
              Join nonprofits already saving time with 123impact.
            </p>
            <Link
              href="/login?mode=signup"
              className="inline-block px-8 py-3.5 rounded-lg bg-white text-blue-600 font-semibold text-base hover:bg-blue-50 transition-colors shadow-md"
            >
              Start for Free
            </Link>
          </div>
        </section>
      </main>
    </>
  )
}
