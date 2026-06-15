import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { validatePassword } from '@/lib/password';

// POST /api/auth/signup — creates an account, enforcing the password policy
// server-side (the client-side checks in app/login/page.tsx can be bypassed).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

  const { email, password, redirectPath } = body;
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  // Only follow same-origin relative paths; reject //evil.com, /\evil.com, absolute URLs
  const next = typeof redirectPath === 'string'
    && redirectPath.startsWith('/')
    && !redirectPath.startsWith('//')
    && !redirectPath.startsWith('/\\')
    ? redirectPath
    : null;

  const passwordError = validatePassword(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
        },
      },
    }
  );

  const origin = new URL(req.url).origin;
  const emailRedirectTo = next
    ? `${origin}/auth/verify?next=${encodeURIComponent(next)}`
    : `${origin}/auth/verify`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const alreadyRegistered = !!(data.user && data.user.identities && data.user.identities.length === 0);
  return NextResponse.json({ alreadyRegistered });
}
