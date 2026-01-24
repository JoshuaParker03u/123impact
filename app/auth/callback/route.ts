// app/auth/callback/route.ts - Minimal approach
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  // Don't exchange the code here - let the client do it
  // Just pass the code through to the dashboard
  const redirectUrl = new URL(next, origin)
  redirectUrl.searchParams.set('code', code)
  
  return NextResponse.redirect(redirectUrl.toString())
}