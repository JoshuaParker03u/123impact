import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const KNOWN_HOSTS = ['123impact.org', 'www.123impact.org', 'localhost', '127.0.0.1'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Skip auth callback, Next.js internals, and static files
  if (
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Custom domain detection — pass host to downstream via header, no DB call here
  const host = req.headers.get('host')?.split(':')[0] ?? '';
  const isCustomDomain = host !== '' && !KNOWN_HOSTS.some(h => host === h || host.endsWith('.' + h)) && !host.includes('vercel.app');

  let response = NextResponse.next({ request: { headers: req.headers } })

  if (isCustomDomain) {
    // Clone headers to add x-custom-host
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-custom-host', host);
    response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('x-custom-host', host);
    // Custom domain visitors don't need admin auth — return early
    if (!pathname.startsWith('/admin')) return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: req.headers } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Only hard-protect /admin routes — /dashboard handles its own auth client-side
  if (pathname.startsWith('/admin') && !user) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('reason', 'session_expired')
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}