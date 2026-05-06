import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// POST /api/qr/scan
// Public — no auth required. Records an anonymous scan event (date only, no PII).
// Body: { ref_token: string, event_id: string }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { ref_token, event_id } = body ?? {};

  if (!ref_token || !event_id) {
    return NextResponse.json({ error: 'ref_token and event_id are required' }, { status: 400 });
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Look up the active instance by ref_token
  const { data: instance } = await service
    .from('qr_code_instances')
    .select('id, event_id, is_active')
    .eq('ref_token', ref_token)
    .eq('is_active', true)
    .maybeSingle();

  if (!instance) {
    // Silently succeed — expired/invalid tokens shouldn't block registration
    return NextResponse.json({ ok: true });
  }

  // Verify the event_id matches (prevents cross-event token abuse)
  if (instance.event_id !== event_id) {
    return NextResponse.json({ ok: true });
  }

  await service.from('qr_scan_events').insert({
    instance_id: instance.id,
    event_id:    instance.event_id,
    // scan_date defaults to CURRENT_DATE in the DB
  });

  return NextResponse.json({ ok: true });
}
