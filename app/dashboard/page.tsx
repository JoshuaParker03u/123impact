'use client'

import { Suspense, useEffect, useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Sparkles, CheckCircle2, ShieldCheck, Calendar, Clock, Users,
  UserPlus, AlertTriangle, TrendingUp, ArrowRight, QrCode, Mail, Loader2,
} from 'lucide-react'
import AdminNavigation from '@/components/admin/AdminNavigation'
import CreateOrganizationModal from '@/components/admin/CreateOrganizationModal'
import MessageComposer from '@/components/MessageComposer'
import { getBrowserClient } from '@/lib/supabase'
import { useOrganization } from '@/contexts/OrganizationContext'
import { useStreamerMode } from '@/contexts/StreamerModeContext'
import { redact } from '@/lib/redact'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function FillBar({ filled, capacity }: { filled: number; capacity: number }) {
  const pct = capacity > 0 ? Math.min(100, Math.round((filled / capacity) * 100)) : 0
  const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : 'bg-orange-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums w-14 text-right">
        {filled}/{capacity}
      </span>
    </div>
  )
}

function DashboardContent() {
  const { refreshOrganization, currentOrganization } = useOrganization() as any
  const { streamerMode } = useStreamerMode()
  const [messageVolunteer, setMessageVolunteer] = useState<{ name: string; email: string } | null>(null)
  const [user, setUser]                         = useState<User | null>(null)
  const [isLoading, setIsLoading]               = useState(true)
  const [isFirstLogin, setIsFirstLogin]         = useState(false)
  const [authProvider, setAuthProvider]         = useState<string>('Unknown')
  const [showVerifiedBanner, setShowVerifiedBanner] = useState(false)
  const [eventAdminAssignments, setEventAdminAssignments] = useState<any[]>([])
  const [hasOrg, setHasOrg]                     = useState<boolean | null>(null)
  const [orgId, setOrgId]                       = useState<string | null>(null)
  const [summary, setSummary]                   = useState<any>(null)
  const [showCreateOrg, setShowCreateOrg]       = useState(false)
  const [resolvingEventId, setResolvingEventId] = useState<string | null>(null)
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([])
  const [actingInviteToken, setActingInviteToken] = useState<string | null>(null)

  const router      = useRouter()
  const searchParams = useSearchParams()
  const supabase    = useMemo(() => getBrowserClient(), [])

  useEffect(() => {
    async function handleAuthCallback() {
      const code     = searchParams.get('code')
      const verified = searchParams.get('verified')

      if (verified === 'true') {
        setShowVerifiedBanner(true)
        setTimeout(() => setShowVerifiedBanner(false), 5000)
      }

      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(code)
          await refreshOrganization()
        } catch {}
        const next = searchParams.get('next')
        const safeNext = next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
          ? next
          : '/dashboard'
        // Full browser navigation (not router.replace) so the session cookie
        // is committed before the next request hits the middleware
        window.location.href = safeNext
        return
      }

      await fetchUser()
    }

    async function fetchUser() {
      try {
        let { data: { user }, error } = await supabase.auth.getUser()
        // If the session is still settling after a fresh exchange, retry once
        if ((error || !user) && !searchParams.get('code')) {
          await new Promise(r => setTimeout(r, 800))
          const retry = await supabase.auth.getUser()
          user  = retry.data.user
          error = retry.error
        }
        if (error) { router.push('/login?reason=auth_error'); return }
        if (!user)  { router.push('/login?reason=no_user');   return }

        setUser(user)

        if (user.identities && user.identities.length > 0) {
          const providerMap: Record<string, string> = {
            google: 'Google', azure: 'Microsoft', github: 'GitHub', email: 'Email',
          }
          setAuthProvider(providerMap[user.identities[0].provider] || user.identities[0].provider)
        }

        const accountAge  = Date.now() - new Date(user.created_at).getTime()
        setIsFirstLogin(accountAge < 5 * 60 * 1000)

        const [assignmentsRes, orgsRes, invitesRes] = await Promise.all([
          fetch('/api/users/me/event-admin-assignments'),
          fetch('/api/organizations/user'),
          fetch('/api/users/me/invitations'),
        ])

        if (assignmentsRes.ok) setEventAdminAssignments(await assignmentsRes.json())
        if (invitesRes.ok) setPendingInvitations(await invitesRes.json())

        if (orgsRes.ok) {
          const { data } = await orgsRes.json()
          const orgs = data ?? []
          if (orgs.length > 0) {
            setHasOrg(true)
            const storedId = typeof window !== 'undefined'
              ? localStorage.getItem('123impact_current_org_id') : null
            const matched  = orgs.find((o: any) => o.id === storedId) ?? orgs[0]
            setOrgId(matched.id)
          } else {
            setHasOrg(false)
          }
        } else {
          setHasOrg(false)
        }

        setIsLoading(false)
      } catch {
        router.push('/login?reason=unexpected_error')
      }
    }

    handleAuthCallback()
  }, [supabase, router, searchParams])

  const summaryOrgId = currentOrganization?.id ?? orgId
  useEffect(() => {
    if (!summaryOrgId) return
    fetch(`/api/dashboard/summary?org_id=${summaryOrgId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setSummary(data) })
  }, [summaryOrgId])

  async function handleInviteAction(token: string, action: 'accept' | 'decline') {
    setActingInviteToken(token)
    try {
      const res = await fetch(`/api/invite/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? 'Something went wrong.')
        return
      }
      setPendingInvitations((prev) => prev.filter((i: any) => i.token !== token))
      if (action === 'accept') {
        await refreshOrganization()
        const orgsRes = await fetch('/api/organizations/user')
        if (orgsRes.ok) {
          const { data: orgs } = await orgsRes.json()
          if ((orgs ?? []).length > 0) {
            setHasOrg(true)
            const storedId = typeof window !== 'undefined' ? localStorage.getItem('123impact_current_org_id') : null
            const matched = (orgs ?? []).find((o: any) => o.id === storedId) ?? orgs[0]
            setOrgId(matched.id)
          }
        }
      }
    } finally {
      setActingInviteToken(null)
    }
  }

  async function markOngoing(eventId: string) {
    setResolvingEventId(eventId)
    await getBrowserClient().from('events').update({ status: 'ongoing' }).eq('id', eventId)
    setSummary((prev: any) => ({
      ...prev,
      actionItems: {
        ...prev.actionItems,
        switchToOngoing: prev.actionItems.switchToOngoing.filter((e: any) => e.id !== eventId),
      },
    }))
    setResolvingEventId(null)
  }

  async function resolveStaleEvent(eventId: string, newStatus: 'completed' | 'cancelled') {
    setResolvingEventId(eventId)
    await getBrowserClient().from('events').update({ status: newStatus }).eq('id', eventId)
    setSummary((prev: any) => ({
      ...prev,
      actionItems: {
        ...prev.actionItems,
        staleEvents: prev.actionItems.staleEvents.filter((e: any) => e.id !== eventId),
      },
    }))
    setResolvingEventId(null)
  }

  const today         = new Date().toISOString().split('T')[0]
  const todayEvent    = summary?.upcomingEvents?.find((e: any) => e.date === today) ?? null
  const upcomingOther = summary?.upcomingEvents?.filter((e: any) => e.date !== today) ?? []
  const ongoingEvents    = summary?.ongoingEvents ?? []
  const staleEvents        = summary?.actionItems?.staleEvents ?? []
  const switchToOngoing    = summary?.actionItems?.switchToOngoing ?? []
  const eventsWithNoShifts = summary?.actionItems?.eventsWithNoShifts ?? []
  const hasNoEvents        = summary?.actionItems?.hasNoEvents ?? false
  const actionCount        = (summary?.actionItems?.understaffedShifts ?? 0)
                           + (summary?.actionItems?.pendingInvitations ?? 0)
                           + staleEvents.length
                           + switchToOngoing.length
                           + eventsWithNoShifts.length
                           + (hasNoEvents ? 1 : 0)
  const onboardingOnly    = hasNoEvents && actionCount === 1

  return (
    <div className="min-h-screen bg-background dark:bg-gray-950">
      <AdminNavigation />

      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-2 py-32">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-lg font-medium text-gray-600 dark:text-gray-400">Loading your impact...</span>
        </div>
      ) : (
      <main className="container mx-auto px-4 py-8 space-y-6">

        {/* Email Verified Banner */}
        {showVerifiedBanner && (
          <Card className="border-2 border-green-100 dark:border-green-900 bg-gradient-to-r from-green-50/50 to-emerald-50/50 dark:from-green-950/30 dark:to-emerald-950/30 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-md">
                  <CheckCircle2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Email Verified! ✓</h2>
                  <p className="text-gray-700 dark:text-gray-300">Your email has been successfully verified. Welcome to 123impact!</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* First-time welcome */}
        {isFirstLogin && (
          <Card className="border-2 border-blue-100 dark:border-blue-900 bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-blue-950/30 dark:to-purple-950/30 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-md">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Welcome to 123impact! 🎉</h2>
                  <p className="text-gray-700 dark:text-gray-300 mb-4">Your account has been created. You're all set to start managing volunteer events!</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <p className="flex items-center gap-2"><span className="text-green-500 font-bold">✓</span> Email: {user?.email}</p>
                    <p className="flex items-center gap-2"><span className="text-green-500 font-bold">✓</span> Auth Method: {authProvider}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pending Org Invitations */}
        {pendingInvitations.length > 0 && (
          <Card className="shadow-sm border-blue-200 dark:border-blue-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-blue-700 dark:text-blue-400">
                <Mail className="w-4 h-4" /> Pending Invitation{pendingInvitations.length !== 1 ? 's' : ''}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingInvitations.map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-blue-100 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20">
                  <div className="flex items-center gap-3 min-w-0">
                    {inv.organization?.logo_url ? (
                      <img src={inv.organization.logo_url} alt={inv.organization.name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {(inv.organization?.name ?? '??').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{inv.organization?.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {inv.inviter_name} invited you as <span className="capitalize">{inv.role}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {actingInviteToken === inv.token ? (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => handleInviteAction(inv.token, 'decline')}>
                          Decline
                        </Button>
                        <Button size="sm" onClick={() => handleInviteAction(inv.token, 'accept')} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                          Accept
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* No-org hint */}
        {!hasOrg && eventAdminAssignments.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 px-1">You don't belong to any organization yet — see below to get started.</p>
        )}

        {/* Quick Actions — mobile only */}
        {hasOrg && (
          <div className="grid grid-cols-3 gap-3 md:hidden">
            {[
              { href: '/admin/events',        icon: <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />,   label: 'Events',     bg: 'bg-blue-50 dark:bg-blue-900/30'   },
              { href: '/admin/organizations?tab=members', icon: <UserPlus className="w-5 h-5 text-purple-600 dark:text-purple-400" />, label: 'Invite to Org', bg: 'bg-purple-50 dark:bg-purple-900/30' },
              { href: '/admin/volunteers',    icon: <Users className="w-5 h-5 text-green-600 dark:text-green-400" />,     label: 'Volunteers', bg: 'bg-green-50 dark:bg-green-900/30'  },
            ].map(({ href, icon, label, bg }) => (
              <Link key={href} href={href}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="pt-5 pb-4 flex flex-col items-center gap-2">
                    <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>{icon}</div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {/* Action Items */}
        {hasOrg && actionCount > 0 && (
          <Card className={onboardingOnly ? 'shadow-sm border-green-200 dark:border-green-900/50' : 'shadow-sm border-orange-200 dark:border-orange-900/50'}>
            <CardHeader className="pb-2">
              {onboardingOnly ? (
                <CardTitle className="text-base flex items-center gap-2 text-green-700 dark:text-green-400">
                  <ArrowRight className="w-4 h-4" /> Next Steps
                </CardTitle>
              ) : (
                <CardTitle className="text-base flex items-center gap-2 text-orange-700 dark:text-orange-400">
                  <AlertTriangle className="w-4 h-4" /> Needs Attention
                </CardTitle>
              )}
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              {hasNoEvents && (
                <Link href="/admin/events">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                    <span className="text-sm text-blue-600 dark:text-blue-400">Create your first event to get started</span>
                    <ArrowRight className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                </Link>
              )}
              {summary.actionItems.understaffedShifts > 0 && (
                <Link href="/admin/events">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors">
                    <span className="text-sm text-orange-600 dark:text-orange-400">
                      <span className="font-semibold text-orange-700 dark:text-orange-400">{summary.actionItems.understaffedShifts}</span>
                      {' '}shift{summary.actionItems.understaffedShifts !== 1 ? 's' : ''} across{' '}
                      <span className="font-semibold text-orange-700 dark:text-orange-400">{summary.actionItems.understaffedEventCount}</span>
                      {' '}event{summary.actionItems.understaffedEventCount !== 1 ? 's' : ''} under 50% filled
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-orange-500" />
                  </div>
                </Link>
              )}
              {summary.actionItems.pendingInvitations > 0 && (
                <Link href="/admin/organizations">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                    <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">{summary.actionItems.pendingInvitations}</span>
                    <span className="text-sm text-blue-600 dark:text-blue-400">pending invitation{summary.actionItems.pendingInvitations !== 1 ? 's' : ''}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                </Link>
              )}
              {eventsWithNoShifts.length > 0 && (
                <div className="w-full space-y-2">
                  <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 uppercase tracking-wide">
                    Events with no shifts
                  </p>
                  {eventsWithNoShifts.map((e: any) => (
                    <Link key={e.id} href={`/admin/events/${e.event_id}`} className="block">
                      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-orange-900 dark:text-orange-200 truncate">{e.title}</p>
                          <p className="text-xs text-orange-600 dark:text-orange-400">{e.date}{e.end_date ? ` – ${e.end_date}` : ''}</p>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              {switchToOngoing.length > 0 && (
                <div className="w-full space-y-2">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">
                    Multi-day events starting today
                  </p>
                  {switchToOngoing.map((e: any) => (
                    <div key={e.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-200 truncate">{e.title}</p>
                        <p className="text-xs text-blue-600 dark:text-blue-400">{e.date} – {e.end_date}</p>
                      </div>
                      <div className="shrink-0">
                        {resolvingEventId === e.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        ) : (
                          <button
                            onClick={() => markOngoing(e.id)}
                            className="text-xs px-2 py-1 rounded border border-blue-400 dark:border-blue-600 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors font-medium"
                          >
                            Mark as Ongoing
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {staleEvents.length > 0 && (
                <div className="w-full space-y-2">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                    Past events still active
                  </p>
                  {staleEvents.slice(0, 3).map((e: any) => (
                    <div key={e.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-amber-900 dark:text-amber-200 truncate">{e.title}</p>
                        <p className="text-xs text-amber-600 dark:text-amber-400">{e.date}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {resolvingEventId === e.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                        ) : (
                          <>
                            <button
                              onClick={() => resolveStaleEvent(e.id, 'completed')}
                              className="text-xs px-2 py-1 rounded border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
                            >
                              Complete
                            </button>
                            <button
                              onClick={() => resolveStaleEvent(e.id, 'cancelled')}
                              className="text-xs px-2 py-1 rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {staleEvents.length > 3 && (
                    <Link href="/admin/events" className="text-xs text-amber-600 dark:text-amber-400 hover:underline">
                      +{staleEvents.length - 3} more →
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Ongoing Events */}
        {ongoingEvents.length > 0 && (
          <Card className="shadow-sm border-purple-200 dark:border-purple-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2 text-purple-700 dark:text-purple-300">
                  <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                  Ongoing Events
                </CardTitle>
                <Link href="/admin/events" className="text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {ongoingEvents.map((e: any) => (
                <Link key={e.id} href={`/admin/events/${e.event_id}`} className="block">
                  <div className="p-3 rounded-lg border border-purple-100 dark:border-purple-900/50 bg-purple-50/40 dark:bg-purple-950/20 hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-colors space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">{e.title}</p>
                      <span className="text-xs text-purple-600 dark:text-purple-400 flex-shrink-0">
                        {new Date(e.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {e.end_date && ` – ${new Date(e.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                      </span>
                    </div>
                    {e.location && <p className="text-xs text-gray-500 dark:text-gray-400">{e.location}</p>}
                    {e.capacity > 0 && <FillBar filled={e.filled} capacity={e.capacity} />}
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Today's Event */}
        {todayEvent && (
          <Card className="shadow-sm border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-blue-950/20 dark:to-purple-950/20">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2 text-blue-700 dark:text-blue-300">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  Happening Today
                </CardTitle>
                <Link href={`/admin/events/${todayEvent.event_id}`}>
                  <Button size="sm" className="gap-1.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-xs">
                    <QrCode className="w-3.5 h-3.5" /> Check In
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href={`/admin/events/${todayEvent.event_id}`} className="block">
                <p className="font-semibold text-gray-900 dark:text-gray-100 text-lg leading-snug hover:text-blue-700 dark:hover:text-blue-300 transition-colors">{todayEvent.title}</p>
                {todayEvent.location && <p className="text-sm text-gray-500 dark:text-gray-400">{todayEvent.location}</p>}
                {todayEvent.capacity > 0 && <FillBar filled={todayEvent.filled} capacity={todayEvent.capacity} />}
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Upcoming Events */}
        {hasOrg && upcomingOther.length > 0 && (
          <Card className="shadow-sm border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2 text-gray-800 dark:text-gray-200">
                  <TrendingUp className="w-4 h-4 text-blue-600" /> Upcoming Events
                </CardTitle>
                <Link href="/admin/events" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingOther.map((e: any) => (
                <Link key={e.id} href={`/admin/events/${e.event_id}`} className="block">
                  <div className="p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">{e.title}</p>
                      <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                        {new Date(e.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    {e.capacity > 0 && <FillBar filled={e.filled} capacity={e.capacity} />}
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Recent Signups */}
        {hasOrg && summary?.recentSignups?.length > 0 && (
          <Card className="shadow-sm border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2 text-gray-800 dark:text-gray-200">
                  <Users className="w-4 h-4 text-green-600" /> Recent Sign-ups
                </CardTitle>
                <Link href="/admin/volunteers" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="divide-y divide-gray-50 dark:divide-gray-800">
              {summary.recentSignups.map((s: any, i: number) => (
                <div key={i} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {streamerMode ? '?' : s.name.trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{redact(s.name, 'name', streamerMode)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{s.eventTitle}{s.shiftName ? ` · ${s.shiftName}` : ''}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-400 dark:text-gray-500">{timeAgo(s.registeredAt)}</p>
                    {!streamerMode && (
                      <button onClick={() => setMessageVolunteer({ name: s.name, email: s.email })} className="text-xs text-blue-500 hover:underline flex items-center gap-0.5 justify-end mt-0.5">
                        <Mail className="w-3 h-3" /> Email
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Event Admin assignments */}
        {eventAdminAssignments.length > 0 && (
          <Card className="shadow-sm border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                {hasOrg ? "Events You're Managing" : 'Your Event Admin Access'}
              </CardTitle>
              {hasOrg && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Events from other organizations where you have been assigned as Event Admin
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {eventAdminAssignments.map((a: any) => (
                <Link key={a.id} href={`/admin/events/${a.event.event_id}`} className="block">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <div className="flex items-center gap-3">
                      {a.org.logo_url ? (
                        <img src={a.org.logo_url} alt={a.org.name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {a.org.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{a.event.title}</p>
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium">Event Admin</span>
                        </div>
                        <p className="text-xs text-gray-500">{a.org.name}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(a.event.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                        <Clock className="w-3.5 h-3.5" />
                        Access until {new Date(a.expires_at.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {/* No org — getting started */}
        {hasOrg === false && eventAdminAssignments.length === 0 && (
          <Card className="shadow-sm border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600" /> Get Started
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg border border-blue-100 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Create an organization</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Set up your nonprofit and start managing volunteer events.</p>
                </div>
                <Button size="sm" onClick={() => setShowCreateOrg(true)} className="flex-shrink-0 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                  Create
                </Button>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Waiting for an invitation?</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Organization administrators can invite you by email. Check your inbox or ask them to resend.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

      </main>
      )}

      {showCreateOrg && (
        <CreateOrganizationModal
          onClose={() => setShowCreateOrg(false)}
          onSuccess={(newOrg: any) => {
            setShowCreateOrg(false)
            localStorage.setItem('123impact_current_org_id', newOrg.id)
            setHasOrg(true)
            setOrgId(newOrg.id)
            refreshOrganization()
          }}
        />
      )}

      <MessageComposer
        isOpen={!!messageVolunteer}
        onClose={() => setMessageVolunteer(null)}
        volunteerEmail={messageVolunteer?.email}
        volunteerName={messageVolunteer?.name}
      />
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background dark:bg-gray-950">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-lg font-medium text-gray-600">Loading...</span>
        </div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  )
}
