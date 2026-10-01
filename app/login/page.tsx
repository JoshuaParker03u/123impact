'use client'
import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase'
import { Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { PASSWORD_RULES, PASSWORD_REQUIREMENTS_TEXT, validatePassword } from '@/lib/password'

type OAuthProvider = 'google' | 'azure' | 'discord' | null
type AuthMode = 'signin' | 'signup'

const REDIRECT_PREFIXES = ['/invite/', '/event-invite/', '/events/', '/admin/']

function safeDestination(redirect: string | null, fallback = '/dashboard') {
  return redirect && REDIRECT_PREFIXES.some((p) => redirect.startsWith(p)) ? redirect : fallback
}

function LoginContent() {
  const [isLoading, setIsLoading] = useState<OAuthProvider>(null)
  const [isEmailLoading, setIsEmailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [mode, setMode] = useState<AuthMode>('signin')
  const [sessionChecked, setSessionChecked] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = getBrowserClient()

  // /admin/* is middleware-protected, so a soft router.push can hit the guard
  // before the freshly written session cookie is committed and bounce back to
  // /login. Use a full navigation for those; soft-navigate everywhere else.
  const navigateAfterAuth = (dest: string) => {
    if (dest.startsWith('/admin/')) {
      window.location.href = dest
    } else {
      router.push(dest)
    }
  }

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

    // session_expired message is deferred until checkAndRedirect confirms no valid session

    if (searchParams.get('mode') === 'signup') {
      setMode('signup')
    }
  }, [searchParams])

  useEffect(() => {
    const checkAndRedirect = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          navigateAfterAuth(safeDestination(searchParams.get('redirect')))
        } else {
          // No valid session — now safe to show the session_expired message
          if (searchParams.get('reason') === 'session_expired') {
            setError('Your session expired. Please sign in again.')
          }
          setSessionChecked(true)
        }
      } catch (err) {
        console.error('Error checking session:', err)
        setSessionChecked(true)
      }
    }
    checkAndRedirect()
  }, [supabase, router, searchParams])

  const handleOAuthLogin = async (provider: 'google' | 'azure' | 'discord') => {
    try {
      setIsLoading(provider)
      setError(null)

      const redirectParam = searchParams.get('redirect')
      if (redirectParam && (
        redirectParam.startsWith('/invite/') ||
        redirectParam.startsWith('/event-invite/') ||
        redirectParam.startsWith('/events/') ||
        redirectParam.startsWith('/admin/')
      )) {
        // Cookie survives the OAuth roundtrip; URL params may not
        // Do NOT encodeURIComponent — slashes are safe in cookie values and encoding breaks startsWith checks
        document.cookie = `oauth_redirect=${redirectParam}; path=/; max-age=300; SameSite=Lax`
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      
      if (error) {
        console.error('OAuth initiation error:', error)
        throw error
      }
      
    } catch (err: any) {
      console.error('Login error:', err)
      setError(err.message || `Failed to sign in with ${provider === 'azure' ? 'Microsoft' : provider === 'discord' ? 'Discord' : 'Google'}`)
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
        if (password !== confirmPassword) {
          setError('Passwords do not match.')
          setIsEmailLoading(false)
          return
        }

        const passwordError = validatePassword(password)
        if (passwordError) {
          setError(passwordError)
          setIsEmailLoading(false)
          return
        }

        // Carry the invite/event-invite redirect through email verification
        // so the user lands back where they need to accept it.
        const redirectParam = searchParams.get('redirect')
        const redirectPath = redirectParam && (
          redirectParam.startsWith('/invite/') ||
          redirectParam.startsWith('/event-invite/') ||
          redirectParam.startsWith('/events/') ||
          redirectParam.startsWith('/admin/')
        ) ? redirectParam : undefined

        // Sign up — routed through our API so the password policy is
        // enforced server-side too, not just in this form.
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, redirectPath }),
        })
        const result = await res.json()

        if (!res.ok) throw new Error(result.error || 'Failed to create account')

        if (result.alreadyRegistered) {
          setError('An account with this email already exists. Please sign in instead.')
          setMode('signin')
        } else {
          setSuccess('Check your email for the verification link!')
          setEmail('')
          setPassword('')
          setConfirmPassword('')
        }
      } else {
        // Sign in
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) throw error

        navigateAfterAuth(safeDestination(searchParams.get('redirect')))
      }
    } catch (err: any) {
      console.error('Email auth error:', err)
      setError(err.message || 'Authentication failed')
    } finally {
      setIsEmailLoading(false)
    }
  }

  // While checking if an existing session can forward the user, show nothing
  // to avoid a flash of the login form before the redirect fires.
  if (!sessionChecked && searchParams.get('reason') === 'session_expired') {
    return <div className="min-h-screen bg-gray-950" />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
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
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-300 text-sm">
              <p className="font-semibold">Error:</p>
              <p>{error}</p>
            </div>
          )}
          
          {success && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-800 dark:text-green-300 text-sm">
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
                name="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={isEmailLoading}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === 'signup' ? 8 : 6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                disabled={isEmailLoading}
                {...(mode === 'signup' ? { passwordrules: PASSWORD_RULES } as any : {})}
              />
              {mode === 'signup' && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{PASSWORD_REQUIREMENTS_TEXT}</p>
              )}
            </div>

            {mode === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  disabled={isEmailLoading}
                  {...{ passwordrules: PASSWORD_RULES } as any}
                />
              </div>
            )}

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
              <p className="text-gray-600 dark:text-gray-400">
                Don't have an account?{' '}
                <button
                  onClick={() => {
                    setMode('signup')
                    setError(null)
                    setSuccess(null)
                    setConfirmPassword('')
                  }}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  Sign up
                </button>
              </p>
            ) : (
              <p className="text-gray-600 dark:text-gray-400">
                Already have an account?{' '}
                <button
                  onClick={() => {
                    setMode('signin')
                    setError(null)
                    setSuccess(null)
                  }}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
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
              <span className="bg-white dark:bg-gray-900 px-2 text-gray-500 dark:text-gray-400">Or continue with</span>
            </div>
          </div>
          
          {/* Google OAuth Button */}
          <Button
            onClick={() => handleOAuthLogin('google')}
            disabled={isLoading !== null || isEmailLoading}
            className="w-full h-12 text-base font-medium bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 border-2 border-gray-300 dark:border-gray-600"
            variant="outline"
          >
            {isLoading === 'google' ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                Signing in...
              </span>
            ) : (
              <span className="flex items-center gap-3">
                <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google
              </span>
            )}
          </Button>

          {/* Microsoft OAuth Button */}
          <Button
            onClick={() => handleOAuthLogin('azure')}
            disabled={isLoading !== null || isEmailLoading}
            className="w-full h-12 text-base font-medium bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 border-2 border-gray-300 dark:border-gray-600"
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

          {/* Discord OAuth Button */}
          <Button
            onClick={() => handleOAuthLogin('discord')}
            disabled={isLoading !== null || isEmailLoading}
            className="w-full h-12 text-base font-medium bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 border-2 border-gray-300 dark:border-gray-600"
            variant="outline"
          >
            {isLoading === 'discord' ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                Signing in...
              </span>
            ) : (
              <span className="flex items-center gap-3">
                <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path fill="#5865F2" d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.099.246.197.373.291a.077.077 0 0 1-.006.128 12.3 12.3 0 0 1-1.873.892.076.076 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.42 0 1.333-.955 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z"/>
                </svg>
                Discord
              </span>
            )}
          </Button>

          <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-4">
            By signing in, you agree to our{' '}
            <a href="/terms" className="text-blue-600 dark:text-blue-400 hover:underline">
              Terms of Service
            </a>
            {' '}and{' '}
            <a href="/privacy" className="text-blue-600 dark:text-blue-400 hover:underline">
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
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