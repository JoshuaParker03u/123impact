// app/auth/callback/route.ts
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const error_description = searchParams.get('error_description')
  const next = searchParams.get('next') ?? '/dashboard'

  // Log everything for debugging
  console.log('=== AUTH CALLBACK ===')
  console.log('Full URL:', request.url)
  console.log('Code:', code ? 'EXISTS' : 'MISSING')
  console.log('Error:', error)
  console.log('Error Description:', error_description)

  // If there's an OAuth error from the provider
  if (error) {
    console.error('OAuth provider error:', error, error_description)
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error_description || error)}`)
  }

  // If no code, something went wrong
  if (!code) {
    console.error('No code in callback URL')
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  // Pass the code to dashboard for client-side exchange
  const redirectUrl = new URL(next, origin)
  redirectUrl.searchParams.set('code', code)
  
  console.log('Redirecting to:', redirectUrl.toString())
  return NextResponse.redirect(redirectUrl.toString())
}