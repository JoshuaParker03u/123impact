'use client'

import { Suspense, useEffect, useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Heart, LogOut, Sparkles, CheckCircle2 } from 'lucide-react'
import type { User } from '@supabase/supabase-js'

function DashboardContent() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFirstLogin, setIsFirstLogin] = useState(false)
  const [authProvider, setAuthProvider] = useState<string>('Unknown')
  const [showVerifiedBanner, setShowVerifiedBanner] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    async function handleAuthCallback() {
      const code = searchParams.get('code')
      const verified = searchParams.get('verified')
      
      // Show verification success banner
      if (verified === 'true') {
        setShowVerifiedBanner(true)
        setTimeout(() => setShowVerifiedBanner(false), 5000) // Hide after 5 seconds
      }
      
      if (code) {
        console.log('Dashboard: Found auth code, attempting exchange...')
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            console.warn('Dashboard: Code exchange error:', error.message)
          } else {
            console.log('Dashboard: Code exchange successful!')
          }
          router.replace('/dashboard')
        } catch (err) {
          console.error('Dashboard: Unexpected error during code exchange:', err)
        }
      }
      
      await fetchUser()
    }
    
    async function fetchUser() {
      try {
        console.log('Dashboard: Checking session...')
        const { data: { user }, error } = await supabase.auth.getUser()
        
        if (error) {
          console.error('Dashboard: getUser() error:', error.message)
          router.push('/login?reason=auth_error')
          return
        }

        if (!user) {
          console.warn('Dashboard: No user found, redirecting to login...')
          router.push('/login?reason=no_user')
          return
        }

        console.log('Dashboard: Authentication successful for:', user.email)
        console.log('Dashboard: User app_metadata:', user.app_metadata)
        console.log('Dashboard: User identities:', user.identities)
        
        setUser(user)
        
        // Detect auth provider from identities
        if (user.identities && user.identities.length > 0) {
          const provider = user.identities[0].provider
          // Map provider names to display names
          const providerMap: Record<string, string> = {
            'google': 'Google',
            'azure': 'Microsoft',
            'github': 'GitHub',
            'email': 'Email'
          }
          setAuthProvider(providerMap[provider] || provider)
        }
        
        const accountAge = Date.now() - new Date(user.created_at).getTime()
        const fiveMinutes = 5 * 60 * 1000
        setIsFirstLogin(accountAge < fiveMinutes)
        
        setIsLoading(false)
      } catch (err) {
        console.error('Dashboard: Unexpected error in fetchUser:', err)
        router.push('/login?reason=unexpected_error')
      }
    }

    handleAuthCallback()
  }, [supabase, router, searchParams])

  const handleSignOut = async () => {
    console.log('Dashboard: Signing out...')
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-lg font-medium text-gray-600">Loading your impact...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-sm">
              <Heart className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              123impact
            </h1>
          </div>
          <Button onClick={handleSignOut} variant="outline" className="gap-2 border-gray-200 hover:bg-gray-50">
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Email Verified Banner */}
        {showVerifiedBanner && (
          <Card className="mb-6 border-2 border-green-100 bg-gradient-to-r from-green-50/50 to-emerald-50/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-md">
                  <CheckCircle2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-1">
                    Email Verified! ✓
                  </h2>
                  <p className="text-gray-700">
                    Your email has been successfully verified. Welcome to 123impact!
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* First-time user welcome banner */}
        {isFirstLogin && (
          <Card className="mb-6 border-2 border-blue-100 bg-gradient-to-r from-blue-50/50 to-purple-50/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-md">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">
                    Welcome to 123impact! 🎉
                  </h2>
                  <p className="text-gray-700 mb-4">
                    Your account has been created successfully. You're all set to start managing volunteer events!
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
                    <p className="flex items-center gap-2">
                      <span className="text-green-500 font-bold">✓</span> Email: {user?.email}
                    </p>
                    <p className="flex items-center gap-2">
                      <span className="text-green-500 font-bold">✓</span> Auth Method: {authProvider}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-sm border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl text-gray-800">
              {isFirstLogin ? 'Getting Started' : `Welcome back, ${user?.user_metadata?.full_name || user?.email?.split('@')[0]}!`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">
              You're successfully logged in to the 123impact coordinator dashboard.
            </p>
            
            <div className="grid gap-1 pt-2 border-t border-gray-100">
              <p className="text-sm font-medium text-gray-500">Account Details</p>
              <p className="text-sm text-gray-700">Email: {user?.email}</p>
              {user?.user_metadata?.full_name && (
                <p className="text-sm text-gray-700">Name: {user.user_metadata.full_name}</p>
              )}
              <p className="text-sm text-gray-700">Auth Provider: {authProvider}</p>
              <p className="text-xs text-gray-400">
                Created: {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
              </p>
            </div>

            <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-xl">
              <p className="text-sm text-blue-800 flex items-center gap-2">
                <span className="text-lg">🚧</span>
                <span><strong>Coming soon:</strong> Event management, volunteer rosters, and analytics will be added in the next tasks!</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-lg font-medium text-gray-600">Loading...</span>
        </div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  )
}