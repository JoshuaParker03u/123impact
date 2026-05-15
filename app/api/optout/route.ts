import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const raw: string = body?.email ?? '';
  const email = raw.trim().toLowerCase();

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
  }

  const db = service();

  // Upsert — on conflict do nothing so we don't reset opted_out_at or purged_at
  const { error } = await db
    .from('email_optouts')
    .upsert({ email }, { onConflict: 'email', ignoreDuplicates: true });

  if (error) {
    console.error('Opt-out upsert error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: "You've been added to our opt-out list. Your registration data will be removed within 24 hours.",
  });
}
