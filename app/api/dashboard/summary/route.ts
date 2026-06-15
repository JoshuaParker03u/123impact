import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('org_id')
  if (!orgId) return NextResponse.json({ error: 'Missing org_id' }, { status: 400 })

  const cookieStore = await cookies()
  const session = createServerClient(
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
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const today = new Date().toISOString().split('T')[0]
  const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Upcoming events: fetch all active/ongoing, filter by date in JS to avoid or() interference
  const { data: eventsRaw } = await service
    .from('events')
    .select('id, event_id, title, date, end_date, time, location, is_shiftless, shifts(id, capacity, shift_date)')
    .eq('organization_id', orgId)
    .in('status', ['active', 'ongoing'])
    .order('date', { ascending: true })

  // Include events where end_date >= today (multi-day) OR date >= today (single-day / not started yet)
  const upcomingEventsRaw = (eventsRaw ?? []).filter((e: any) =>
    (e.end_date ?? e.date) >= today
  )

  // Recent signups (last 5 across all org events)
  const { data: allOrgEvents } = await service
    .from('events').select('id').eq('organization_id', orgId)

  const allEventIds = (allOrgEvents ?? []).map((e: any) => e.id)
  let recentSignups: any[] = []

  if (allEventIds.length > 0) {
    const { data: shiftsForSignups } = await service
      .from('shifts').select('id').in('event_id', allEventIds)

    const shiftIds = (shiftsForSignups ?? []).map((s: any) => s.id)

    if (shiftIds.length > 0) {
      const { data: signupsRaw } = await service
        .from('volunteer_registrations')
        .select('name, email, registered_at, shifts(name, events(title))')
        .in('shift_id', shiftIds)
        .order('registered_at', { ascending: false })
        .limit(5)

      recentSignups = (signupsRaw ?? []).map((r: any) => ({
        name:        r.name,
        email:       r.email,
        registeredAt: r.registered_at,
        shiftName:   r.shifts?.name ?? '',
        eventTitle:  r.shifts?.events?.title ?? '',
      }))
    }
  }

  const { count: pendingInvitations } = await service
    .from('organization_invitations')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())

  // Stale events: active or ongoing events where the effective end date is in the past
  const { data: staleEventsRaw } = await service
    .from('events')
    .select('id, event_id, title, date, end_date, time, location, description, image_url, status, event_format, online_url, recording_url, organization_id')
    .eq('organization_id', orgId)
    .in('status', ['active', 'ongoing'])
    .order('date', { ascending: false })

  const staleEvents = (staleEventsRaw ?? []).filter((e: any) =>
    (e.end_date ?? e.date) < today
  )

  // Org plan — needed for paid-only action items
  const { data: orgData } = await service
    .from('organizations')
    .select('plan')
    .eq('id', orgId)
    .single()
  const isPaid = orgData?.plan && orgData.plan !== 'free'

  // Switch-to-ongoing: paid orgs only — active multi-day events that start today
  let switchToOngoing: any[] = []
  if (isPaid) {
    const { data: ongoingRaw } = await service
      .from('events')
      .select('id, title, date, end_date')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .eq('date', today)
      .gt('end_date', today)
    switchToOngoing = ongoingRaw ?? []
  }

  // Ongoing events: two separate queries to avoid nested and() syntax
  const selectOngoing = 'id, event_id, title, date, end_date, time, location, shifts(id, capacity)'
  const [{ data: explicitOngoing }, { data: implicitOngoing }] = await Promise.all([
    service.from('events').select(selectOngoing)
      .eq('organization_id', orgId).eq('status', 'ongoing'),
    service.from('events').select(selectOngoing)
      .eq('organization_id', orgId).eq('status', 'active')
      .lte('date', today).gte('end_date', today),
  ])
  const seenIds = new Set<string>()
  const ongoingEventsRaw = [...(explicitOngoing ?? []), ...(implicitOngoing ?? [])].filter((e: any) => {
    if (seenIds.has(e.id)) return false
    seenIds.add(e.id)
    return true
  })

  // Count volunteer registrations for upcoming + ongoing events in one query
  const allDashboardShiftIds = [
    ...(eventsRaw ?? []).flatMap((e: any) => (e.shifts ?? []).map((s: any) => s.id)),
    ...ongoingEventsRaw.flatMap((e: any) => (e.shifts ?? []).map((s: any) => s.id)),
  ]
  const regCountMap: Record<string, number> = {}
  if (allDashboardShiftIds.length > 0) {
    const { data: regRows } = await service
      .from('volunteer_registrations')
      .select('shift_id, is_waitlisted')
      .in('shift_id', allDashboardShiftIds)
    for (const r of regRows ?? []) {
      if (r.is_waitlisted) continue
      regCountMap[r.shift_id] = (regCountMap[r.shift_id] ?? 0) + 1
    }
  }

  const mapEvent = (e: any) => ({
    id:       e.id,
    event_id: e.event_id,
    title:    e.title,
    date:     e.date,
    end_date: e.end_date ?? null,
    time:     e.time,
    location: e.location,
    filled:   (e.shifts ?? []).reduce((s: number, sh: any) => s + (regCountMap[sh.id] ?? 0), 0),
    capacity: (e.shifts ?? []).reduce((s: number, sh: any) => s + (sh.capacity || 0), 0),
  })

  const upcomingEvents = upcomingEventsRaw.map(mapEvent).slice(0, 5)
  const ongoingEvents  = ongoingEventsRaw.map(mapEvent)

  // Understaffed shifts — computed after regCountMap is available
  const understaffedEventIds = new Set<string>()
  let understaffedShifts = 0
  for (const e of upcomingEventsRaw) {
    for (const s of (e as any).shifts ?? []) {
      const shiftDate = s.shift_date ?? (e as any).date
      if (
        shiftDate <= sevenDaysOut &&
        s.capacity > 0 &&
        (regCountMap[s.id] ?? 0) / s.capacity < 0.5
      ) {
        understaffedShifts++
        understaffedEventIds.add((e as any).id)
      }
    }
  }
  const understaffedEventCount = understaffedEventIds.size

  // Events with no shifts — upcoming active/ongoing events that have no shifts yet
  const eventsWithNoShifts = upcomingEventsRaw
    .filter((e: any) => (e.shifts ?? []).length === 0 && !e.is_shiftless)
    .map((e: any) => ({ id: e.id, event_id: e.event_id, title: e.title, date: e.date, end_date: e.end_date }))

  // No events at all — prompt the user to create their first event
  const { count: totalEventCount } = await service
    .from('events')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
  const hasNoEvents = (totalEventCount ?? 0) === 0

  return NextResponse.json({
    upcomingEvents,
    recentSignups,
    ongoingEvents,
    actionItems: {
      understaffedShifts,
      understaffedEventCount,
      pendingInvitations: pendingInvitations ?? 0,
      staleEvents,
      switchToOngoing,
      eventsWithNoShifts,
      hasNoEvents,
    },
  })
}
