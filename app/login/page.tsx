'use client'
import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { Heart, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

type OAuthProvider = 'google' | 'azure' | null
type AuthMode = 'signin' | 'signup'

function LoginContent() {
  const [isLoading, setIsLoading] = useState<OAuthProvider>(null)
  const [isEmailLoading, setIsEmailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    const errorParam = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')
    const verified = searchParams.get('verified')
    
    if (errorParam) {
      console.error('OAuth Error:', errorParam, errorDescription)
      setError(errorDescription || errorParam)
    }
    
    if (verified === 'true') {
      setSuccess('Email verified successfully! You can now sign in.')
    }
  }, [searchParams])

  useEffect(() => {
    const checkAndRedirect = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session) {
          console.log('User already logged in, redirecting...')
          router.push('/dashboard')
          router.refresh()
        }
      } catch (err) {
        console.error('Error checking session:', err)
      }
    }
    
    checkAndRedirect()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      console.log('Auth event:', event)
      
      if (event === 'SIGNED_IN' && session) {
        console.log('User signed in, redirecting to dashboard')
        await new Promise(resolve => setTimeout(resolve, 100))
        router.push('/dashboard')
        router.refresh()
      }
      
      if (event === 'SIGNED_OUT') {
        console.log('User signed out')
        router.push('/login')
      }

      if (event === 'TOKEN_REFRESHED') {
        console.log('Token refreshed')
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase, router])

  const handleOAuthLogin = async (provider: 'google' | 'azure') => {
    try {
      setIsLoading(provider)
      setError(null)
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      })
      
      if (error) {
        console.error('OAuth initiation error:', error)
        throw error
      }
      
    } catch (err: any) {
      console.error('Login error:', err)
      setError(err.message || `Failed to sign in with ${provider === 'azure' ? 'Microsoft' : 'Google'}`)
      setIsLoading(null)
    }
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsEmailLoading(true)
    setError(null)
    setSuccess(null)

    try {
      if (mode === 'signup') {
        // Sign up
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/verify`,
          },
        })

        if (error) throw error

        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setError('An account with this email already exists. Please sign in instead.')
          setMode('signin')
        } else {
          setSuccess('Check your email for the verification link!')
          setEmail('')
          setPassword('')
        }
      } else {
        // Sign in
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) throw error

        // Redirect will happen via onAuthStateChange
      }
    } catch (err: any) {
      console.error('Email auth error:', err)
      setError(err.message || 'Authentication failed')
    } finally {
      setIsEmailLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center">
            <Heart className="w-9 h-9 text-white" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Welcome to 123impact</CardTitle>
            <CardDescription className="text-base mt-2">
              {mode === 'signin' ? 'Sign in to your account' : 'Create your account to get started'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              <p className="font-semibold">Error:</p>
              <p>{error}</p>
            </div>
          )}
          
          {success && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
              <p className="font-semibold">Success!</p>
              <p>{success}</p>
            </div>
          )}

          {/* Email/Password Form */}
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isEmailLoading}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                disabled={isEmailLoading}
              />
            </div>

            <Button
              type="submit"
              disabled={isEmailLoading}
              className="w-full h-11 text-base font-medium bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {isEmailLoading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⏳</span>
                  {mode === 'signin' ? 'Signing in...' : 'Creating account...'}
                </span>
              ) : (
                mode === 'signin' ? 'Sign In' : 'Create Account'
              )}
            </Button>
          </form>

          {/* Toggle Sign In / Sign Up */}
          <div className="text-center text-sm">
            {mode === 'signin' ? (
              <p className="text-gray-600">
                Don't have an account?{' '}
                <button
                  onClick={() => {
                    setMode('signup')
                    setError(null)
                    setSuccess(null)
                  }}
                  className="text-blue-600 hover:underline font-medium"
                >
                  Sign up
                </button>
              </p>
            ) : (
              <p className="text-gray-600">
                Already have an account?{' '}
                <button
                  onClick={() => {
                    setMode('signin')
                    setError(null)
                    setSuccess(null)
                  }}
                  className="text-blue-600 hover:underline font-medium"
                >
                  Sign in
                </button>
              </p>
            )}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">Or continue with</span>
            </div>
          </div>
          
          {/* Google OAuth Button */}
          <Button
            onClick={() => handleOAuthLogin('google')}
            disabled={isLoading !== null || isEmailLoading}
            className="w-full h-12 text-base font-medium bg-white hover:bg-gray-50 text-gray-900 border-2 border-gray-300"
            variant="outline"
          >
            {isLoading === 'google' ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                Signing in...
              </span>
            ) : (
              <span className="flex items-center gap-3">
                <Mail className="w-5 h-5" />
                Google
              </span>
            )}
          </Button>

          {/* Microsoft OAuth Button */}
          <Button
            onClick={() => handleOAuthLogin('azure')}
            disabled={isLoading !== null || isEmailLoading}
            className="w-full h-12 text-base font-medium bg-white hover:bg-gray-50 text-gray-900 border-2 border-gray-300"
            variant="outline"
          >
            {isLoading === 'azure' ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                Signing in...
              </span>
            ) : (
              <span className="flex items-center gap-3">
                <svg className="w-5 h-5" viewBox="0 0 23 23">
                  <path fill="#f25022" d="M0 0h11v11H0z"/>
                  <path fill="#00a4ef" d="M12 0h11v11H12z"/>
                  <path fill="#7fba00" d="M0 12h11v11H0z"/>
                  <path fill="#ffb900" d="M12 12h11v11H12z"/>
                </svg>
                Microsoft
              </span>
            )}
          </Button>

          <p className="text-xs text-center text-gray-500 mt-4">
            By signing in, you agree to our{' '}
            <a href="/terms" className="text-blue-600 hover:underline">
              Terms of Service
            </a>
            {' '}and{' '}
            <a href="/privacy" className="text-blue-600 hover:underline">
              Privacy Policy
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-lg font-medium text-gray-600">Loading...</span>
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}