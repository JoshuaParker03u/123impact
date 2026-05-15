import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/cron/process-optouts
// Called daily by Vercel Cron (see vercel.json).
// Purges volunteer_registrations for emails that opted out >= 12 hours ago.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  const { data: pending, error: fetchError } = await service
    .from('email_optouts')
    .select('id, email')
    .lte('opted_out_at', cutoff)
    .is('purged_at', null);

  if (fetchError) {
    console.error('process-optouts fetch error:', fetchError);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ processed: 0, totalRemoved: 0 });
  }

  const emails = pending.map((r: any) => r.email);

  const { count: totalRemoved, error: deleteError } = await service
    .from('volunteer_registrations')
    .delete({ count: 'exact' })
    .in('email', emails);

  if (deleteError) {
    console.error('process-optouts delete error:', deleteError);
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const ids = pending.map((r: any) => r.id);
  const { error: updateError } = await service
    .from('email_optouts')
    .update({ purged_at: new Date().toISOString() })
    .in('id', ids);

  if (updateError) {
    console.error('process-optouts update error:', updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ processed: pending.length, totalRemoved: totalRemoved ?? 0 });
}
