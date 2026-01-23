'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Heart, LogOut, Sparkles } from 'lucide-react'
import type { User } from '@supabase/supabase-js'

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFirstLogin, setIsFirstLogin] = useState(false)
  const router = useRouter()
  const supabase = getSupabaseClient()

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      
      // Check if this is their first login by checking account age
      if (user) {
        const accountAge = Date.now() - new Date(user.created_at).getTime()
        const fiveMinutes = 5 * 60 * 1000
        setIsFirstLogin(accountAge < fiveMinutes)
      }
      
      setIsLoading(false)
    }
    getUser()
  }, [supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-lg">Loading...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
              <Heart className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              123impact
            </h1>
          </div>
          <Button onClick={handleSignOut} variant="outline" className="gap-2">
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* First-time user welcome banner */}
        {isFirstLogin && (
          <Card className="mb-6 border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-purple-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">
                    Welcome to 123impact! 🎉
                  </h2>
                  <p className="text-gray-700 mb-4">
                    Your account has been created successfully. You're all set to start managing volunteer events!
                  </p>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>✅ Account created with {user?.email}</p>
                    <p>✅ Signed in with Google</p>
                    <p>🚀 Ready to create your first event (coming soon in Task 5!)</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>
              {isFirstLogin ? 'Getting Started' : `Welcome back, ${user?.user_metadata?.full_name || user?.email}!`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">
              You're successfully logged in to the 123impact coordinator dashboard.
            </p>
            <p className="text-sm text-gray-500 mt-4">
              Email: {user?.email}
            </p>
            {user?.user_metadata?.full_name && (
              <p className="text-sm text-gray-500">
                Name: {user.user_metadata.full_name}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-2">
              Account created: {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
            </p>
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                🚧 <strong>Coming soon:</strong> Event management, volunteer rosters, and analytics will be added in the next tasks!
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
