import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code  = searchParams.get('code')
  const error = searchParams.get('error')
  const error_description = searchParams.get('error_description')

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error_description || error)}`
    )
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  const cookieRedirect = request.cookies.get('oauth_redirect')?.value
  const destination = (cookieRedirect && (
    cookieRedirect.startsWith('/invite/') ||
    cookieRedirect.startsWith('/event-invite/') ||
    cookieRedirect.startsWith('/events/') ||
    cookieRedirect.startsWith('/admin/')
  )) ? cookieRedirect : '/dashboard'

  // Always route through /dashboard for code exchange
  // Dashboard exchanges the code then redirects to `next` param
  const redirectUrl = new URL('/dashboard', origin)
  redirectUrl.searchParams.set('code', code)
  if (destination !== '/dashboard') {
    redirectUrl.searchParams.set('next', destination)
  }

  const response = NextResponse.redirect(redirectUrl.toString())
  response.cookies.set('oauth_redirect', '', { path: '/', maxAge: 0 })
  return response
}
