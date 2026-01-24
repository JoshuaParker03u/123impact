// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          // Check if we're in the browser
          if (typeof document === 'undefined') return undefined
          
          const value = document.cookie
            .split('; ')
            .find(row => row.startsWith(`${name}=`))
            ?.split('=')[1]
          return value
        },
        set(name: string, value: string, options: any) {
          // Check if we're in the browser
          if (typeof document === 'undefined') return
          
          // Construct cookie string with proper attributes
          let cookie = `${name}=${value}`
          
          if (options?.maxAge) {
            cookie += `; max-age=${options.maxAge}`
          }
          if (options?.path) {
            cookie += `; path=${options.path}`
          } else {
            cookie += `; path=/`
          }
          if (options?.sameSite) {
            cookie += `; samesite=${options.sameSite}`
          } else {
            cookie += `; samesite=lax`
          }
          // Only set secure in production
          if (typeof window !== 'undefined' && window.location.protocol === 'https:' && options?.secure !== false) {
            cookie += `; secure`
          }
          
          console.log('Setting cookie:', name)
          document.cookie = cookie
        },
        remove(name: string, options: any) {
          // Check if we're in the browser
          if (typeof document === 'undefined') return
          
          let cookie = `${name}=; max-age=0`
          if (options?.path) {
            cookie += `; path=${options.path}`
          } else {
            cookie += `; path=/`
          }
          console.log('Removing cookie:', name)
          document.cookie = cookie
        },
      },
    }
  )
}