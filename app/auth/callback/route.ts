import { NextResponse } from 'next/server'

export async function GET(request: Request) {
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

  // Read post-OAuth destination from cookie (set before OAuth redirect)
  const cookieRedirect = request.cookies.get('oauth_redirect')?.value
  const destination = (cookieRedirect && (
    cookieRedirect.startsWith('/invite/') ||
    cookieRedirect.startsWith('/event-invite/') ||
    cookieRedirect.startsWith('/events/')
  )) ? cookieRedirect : '/dashboard'

  // Pass code to destination for client-side exchange (same pattern as dashboard)
  const redirectUrl = new URL(destination, origin)
  redirectUrl.searchParams.set('code', code)

  const response = NextResponse.redirect(redirectUrl.toString())
  // Clear the one-time redirect cookie
  response.cookies.set('oauth_redirect', '', { path: '/', maxAge: 0 })
  return response
}
