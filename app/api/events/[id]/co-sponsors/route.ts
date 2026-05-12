import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type Params = { params: Promise<{ id: string }> };

// GET /api/events/[id]/co-sponsors — public, returns active co-sponsor orgs for an event
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: eventId } = await params;

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await service
    .from('event_admin_assignments')
    .select('co_sponsor_org_id, organizations!event_admin_assignments_co_sponsor_org_id_fkey(id, name, logo_url)')
    .eq('event_id', eventId)
    .eq('co_sponsor', true)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString());

  if (error) return NextResponse.json([], { status: 200 });

  const sponsors = (data ?? [])
    .map((row: any) => row.organizations)
    .filter(Boolean);

  return NextResponse.json(sponsors);
}
