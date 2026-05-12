import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import Header from '@/components/layout/Header'
import AdminNavigation from '@/components/admin/AdminNavigation'

export default async function Home() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  return (
    <>
      {user ? <AdminNavigation /> : <Header />}
      <main className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Welcome to 123impact
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
            Powerful volunteer scheduling for nonprofits
          </p>
          <div className="inline-block px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold">
            Coming Soon
          </div>
        </div>
      </main>
    </>
  )
}
