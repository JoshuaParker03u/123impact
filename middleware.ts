// middleware.ts (in project root)
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl
  
  console.log(`[MIDDLEWARE] ${pathname}`)
  
  let response = NextResponse.next({
    request: {
      headers: req.headers,
    },
  })

  // Skip auth callback, Next.js internals, and static files
  if (pathname.startsWith('/auth/callback') || pathname.startsWith('/_next') || pathname.includes('.')) {
    return response
  }

  // If dashboard has a code parameter, allow it through for client-side exchange
  if (pathname.startsWith('/dashboard') && searchParams.has('code')) {
    console.log('[MIDDLEWARE] Dashboard with code param - allowing through for client-side exchange')
    return response
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          req.cookies.set({ name, value, ...options })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          req.cookies.set({ name, value: '', ...options })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  
  console.log(`[MIDDLEWARE] User: ${user ? user.email : 'NONE'}`)

  // Protect dashboard routes (without code parameter)
  if (pathname.startsWith('/dashboard')) {
    if (!user) {
      console.log('[MIDDLEWARE] Redirecting to login')
      return NextResponse.redirect(new URL('/login', req.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}