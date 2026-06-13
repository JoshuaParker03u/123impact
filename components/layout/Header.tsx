'use client'

import { useEffect, useState } from 'react'
import { Heart, LogOut } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import ThemeToggle from '@/components/ThemeToggle'
import { getBrowserClient } from '@/lib/supabase'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

export default function Header() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const supabase = getBrowserClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setIsLoggedIn(!!session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === 'SIGNED_OUT') {
        setIsLoggedIn(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <header className="sticky top-0 z-50 border-b bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
            <Heart className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            123impact
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isLoggedIn ? (
            <Button variant="outline" onClick={handleSignOut} className="gap-2 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          ) : (
            <Link href="/login">
              <Button variant="outline">Coordinator Login</Button>
            </Link>
          )}
        </div>
        </div>
      </div>
    </header>
  )
}
