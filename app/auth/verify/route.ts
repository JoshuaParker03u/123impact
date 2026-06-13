import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const token_hash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type')
  const nextParam = requestUrl.searchParams.get('next')
  // Only follow same-origin relative paths; reject //evil.com, /\evil.com, absolute/userinfo URLs
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') && !nextParam.startsWith('/\\')
    ? nextParam
    : '/dashboard'

  if (token_hash && type) {
    const cookieStore = await cookies()
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: '', ...options })
          },
        },
      }
    )
    
    // Verify the OTP/magic link
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as any,
    })
    
    if (!error) {
      // Redirect to dashboard with code for session exchange
      return NextResponse.redirect(`${requestUrl.origin}${next}?verified=true`)
    }
  }

  // If verification fails, redirect to login with error
  return NextResponse.redirect(`${requestUrl.origin}/login?error=verification_failed`)
}