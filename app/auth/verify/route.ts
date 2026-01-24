import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const token_hash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type')
  const next = requestUrl.searchParams.get('next') ?? '/dashboard'

  console.log('=== EMAIL VERIFICATION ===')
  console.log('Token hash:', token_hash ? 'EXISTS' : 'MISSING')
  console.log('Type:', type)

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
      console.log('✅ Email verified successfully')
      // Redirect to dashboard with code for session exchange
      return NextResponse.redirect(`${requestUrl.origin}${next}?verified=true`)
    }
    
    console.error('❌ Verification error:', error.message)
  }
  
  // If verification fails, redirect to login with error
  console.log('❌ Verification failed - missing token or type')
  return NextResponse.redirect(`${requestUrl.origin}/login?error=verification_failed`)
}