import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import {
  Calendar, Users, QrCode, MessageSquare, BarChart3, Shield,
  Globe, Zap, GitMerge, Check, ArrowRight, Star,
} from 'lucide-react'

export default async function Home() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  const freeFeatures = [
    { icon: Calendar, title: 'Event Management', description: 'Create events with custom schedules and public signup pages live instantly.' },
    { icon: Users,    title: 'Shift Scheduling',  description: 'Define shifts with capacity limits — volunteers self-register in seconds.' },
    { icon: QrCode,   title: 'QR Check-In',        description: 'Generate QR codes for day-of check-in — no paper, no chaos.' },
    { icon: MessageSquare, title: 'Volunteer Messaging', description: 'Send updates, reminders, and announcements directly to your volunteers.' },
    { icon: BarChart3, title: 'Analytics',          description: 'Track attendance, fill rates, and registration trends across all events.' },
    { icon: Shield,   title: 'Role-Based Access',  description: 'Invite event admins without exposing your whole organization.' },
  ]

  const proFeatures = [
    {
      icon: Globe,
      title: 'Custom Domain',
      description: 'Serve signup pages from your own subdomain — events.yourorg.com — with full branding control.',
      highlight: 'White-label your volunteer portal',
    },
    {
      icon: Calendar,
      title: 'Multi-Day Events',
      description: 'Run conferences, retreats, and campaigns that span multiple days with per-day shift scheduling.',
      highlight: 'Perfect for large-scale programs',
    },
    {
      icon: GitMerge,
      title: 'Platform Import',
      description: 'Pull events directly from Luma or Eventbrite — keep your team in one place without double entry.',
      highlight: 'Luma & Eventbrite integration',
    },
    {
      icon: Zap,
      title: 'Unlimited Events',
      description: 'Free plans include 35 events per year. Pro removes that limit entirely.',
      highlight: 'No caps, no surprises',
    },
  ]

  const steps = [
    { number: '1', title: 'Create your event',    description: 'Set the date, location, and shifts. Your signup page is live immediately.' },
    { number: '2', title: 'Volunteers sign up',   description: 'Share the link. Volunteers register with just a name and email — no account needed.' },
    { number: '3', title: 'You stay in control',  description: 'Monitor fill rates, send updates, and check people in on the day — all from one dashboard.' },
  ]

  return (
    <>
      <Header />

      <main>
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-gray-50 dark:bg-gray-950 pt-20 pb-28 px-4">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 pointer-events-none" />
          <div className="relative container mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-sm font-medium mb-6">
              Built for nonprofits &amp; community organizations
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
              <Link href="/login?mode=signup"
                className="px-8 py-3.5 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold text-base shadow-md hover:opacity-90 transition-opacity">
                Get Started Free
              </Link>
              <a href="#pricing"
                className="flex items-center gap-2 px-8 py-3.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold text-base hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                See Pricing <ArrowRight className="w-4 h-4" />
              </a>
            </div>
            <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
              Free forever for small programs · No credit card required
            </p>
          </div>
        </section>

        {/* ── Core Features ────────────────────────────────────────────────── */}
        <section className="py-20 px-4 bg-white dark:bg-gray-900">
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
              {freeFeatures.map((f) => (
                <div key={f.title} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
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

        {/* ── Pro Features ─────────────────────────────────────────────────── */}
        <section className="py-20 px-4 bg-gray-950 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-950/40 to-purple-950/40 pointer-events-none" />
          <div className="relative container mx-auto max-w-5xl">
            <div className="text-center mb-14">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-400/10 text-yellow-400 text-sm font-semibold mb-4">
                <Zap className="w-3.5 h-3.5" /> Pro Plan
              </div>
              <h2 className="text-3xl font-bold text-white mb-3">
                Scale your impact with Pro
              </h2>
              <p className="text-gray-400 text-lg max-w-xl mx-auto">
                Unlock powerful features built for organizations running serious programs.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {proFeatures.map((f) => (
                <div key={f.title} className="bg-gray-900 rounded-xl p-6 border border-gray-700 hover:border-blue-500/50 transition-colors group">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
                      <f.icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-1">{f.highlight}</p>
                      <h3 className="text-base font-semibold text-white mb-1.5">{f.title}</h3>
                      <p className="text-sm text-gray-400 leading-relaxed">{f.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How It Works ─────────────────────────────────────────────────── */}
        <section id="how-it-works" className="py-20 px-4 bg-gray-50 dark:bg-gray-950">
          <div className="container mx-auto max-w-4xl">
            <div className="text-center mb-14">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-50 mb-3">Up and running in minutes</h2>
              <p className="text-gray-500 dark:text-gray-400 text-lg">No training required. No IT department needed.</p>
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

        {/* ── Pricing ──────────────────────────────────────────────────────── */}
        <section id="pricing" className="py-20 px-4 bg-white dark:bg-gray-900">
          <div className="container mx-auto max-w-4xl">
            <div className="text-center mb-14">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-50 mb-3">Simple, honest pricing</h2>
              <p className="text-gray-500 dark:text-gray-400 text-lg">Start free. Upgrade when you're ready to grow.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">

              {/* Free */}
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-8 bg-gray-50 dark:bg-gray-800">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Free</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">For small programs just getting started.</p>
                <div className="mb-8">
                  <span className="text-4xl font-extrabold text-gray-900 dark:text-white">$0</span>
                  <span className="text-gray-500 dark:text-gray-400 ml-1">/ forever</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {['Up to 35 events per year', 'Unlimited volunteers', 'Shift scheduling & QR check-in', 'Volunteer messaging', 'Analytics dashboard', 'Role-based access'].map(item => (
                    <li key={item} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <Check className="w-4 h-4 text-green-500 flex-shrink-0" /> {item}
                    </li>
                  ))}
                </ul>
                <Link href="/login?mode=signup"
                  className="block text-center w-full py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-semibold text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  Get Started Free
                </Link>
              </div>

              {/* Pro */}
              <div className="rounded-2xl border-2 border-blue-500 p-8 bg-white dark:bg-gray-900 relative shadow-xl">
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                  <Star className="w-3 h-3" /> Most Popular
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Pro</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">For organizations running serious programs.</p>
                <div className="mb-8">
                  <span className="text-4xl font-extrabold text-gray-900 dark:text-white">$20</span>
                  <span className="text-gray-500 dark:text-gray-400 ml-1">/ month</span>
                  <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">or $192/yr — save 20%</p>
                </div>
                <ul className="space-y-3 mb-8">
                  {[
                    'Everything in Free',
                    'Unlimited events',
                    'Custom domain (events.yourorg.com)',
                    'Multi-day event support',
                    'Luma & Eventbrite import',
                    'Priority support',
                  ].map(item => (
                    <li key={item} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <Check className="w-4 h-4 text-blue-500 flex-shrink-0" /> {item}
                    </li>
                  ))}
                </ul>
                <Link href={`/login?mode=signup&redirect=${encodeURIComponent('/admin/organizations?tab=billing')}`}
                  className="block text-center w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold text-sm hover:opacity-90 transition-opacity shadow-md">
                  Start Free, Upgrade Anytime
                </Link>
              </div>

            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <section className="py-20 px-4 bg-gradient-to-r from-blue-600 to-purple-600">
          <div className="container mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-white mb-3">Ready to streamline your volunteer program?</h2>
            <p className="text-blue-100 text-lg mb-8">Join nonprofits already saving time with 123impact.</p>
            <Link href="/login?mode=signup"
              className="inline-block px-8 py-3.5 rounded-lg bg-white text-blue-600 font-semibold text-base hover:bg-blue-50 transition-colors shadow-md">
              Start for Free
            </Link>
          </div>
        </section>
      </main>
    </>
  )
}
