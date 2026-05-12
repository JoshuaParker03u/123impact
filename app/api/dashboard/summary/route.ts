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

  // Upcoming events (starting today) with shift fill rates
  const { data: eventsRaw } = await service
    .from('events')
    .select('id, event_id, title, date, time, location, shifts(capacity, filled_count)')
    .eq('organization_id', orgId)
    .gte('date', today)
    .order('date', { ascending: true })
    .limit(5)

  const upcomingEvents = (eventsRaw ?? []).map((e: any) => ({
    id:       e.id,
    event_id: e.event_id,
    title:    e.title,
    date:     e.date,
    time:     e.time,
    location: e.location,
    filled:   (e.shifts ?? []).reduce((s: number, sh: any) => s + (sh.filled_count || 0), 0),
    capacity: (e.shifts ?? []).reduce((s: number, sh: any) => s + (sh.capacity || 0), 0),
  }))

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

  // Action items
  const futureEventIds = upcomingEvents.map((e: any) => e.id)
  let understaffedShifts = 0
  if (futureEventIds.length > 0) {
    const { data: futureShifts } = await service
      .from('shifts').select('capacity, filled_count').in('event_id', futureEventIds).gt('capacity', 0)
    understaffedShifts = (futureShifts ?? []).filter(
      (s: any) => (s.filled_count / s.capacity) < 0.5
    ).length
  }

  const { count: pendingInvitations } = await service
    .from('organization_invitations')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())

  return NextResponse.json({
    upcomingEvents,
    recentSignups,
    actionItems: {
      understaffedShifts,
      pendingInvitations: pendingInvitations ?? 0,
    },
  })
}
