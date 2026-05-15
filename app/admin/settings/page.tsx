'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase'
import { useOrganization } from '@/contexts/OrganizationContext'
import AdminNavigation from '@/components/admin/AdminNavigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { User, Lock, Link2, Globe, Trash2, LogOut as LeaveIcon } from 'lucide-react'
import type { User as SupabaseUser, UserIdentity } from '@supabase/supabase-js'

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  azure:  'Microsoft',
  email:  'Email & Password',
}

function ProviderIcon({ provider }: { provider: string }) {
  if (provider === 'google') return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
  if (provider === 'azure') return (
    <svg className="w-5 h-5" viewBox="0 0 23 23">
      <path fill="#f25022" d="M0 0h11v11H0z"/>
      <path fill="#00a4ef" d="M12 0h11v11H12z"/>
      <path fill="#7fba00" d="M0 12h11v11H0z"/>
      <path fill="#ffb900" d="M12 12h11v11H12z"/>
    </svg>
  )
  return <Lock className="w-5 h-5 text-gray-500" />
}

function SectionResult({ success, error }: { success: string | null; error: string | null }) {
  if (error)   return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
  if (success) return <p className="text-sm text-green-600 dark:text-green-400">{success}</p>
  return null
}

export default function SettingsPage() {
  const router = useRouter()
  const supabase = getBrowserClient()
  const { refreshOrganizations } = useOrganization() as any

  const [user, setUser]       = useState<SupabaseUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Profile
  const [displayName, setDisplayName]       = useState('')
  const [profileSaving, setProfileSaving]   = useState(false)
  const [profileResult, setProfileResult]   = useState<{ ok?: string; err?: string }>({})

  // Password
  const [currentPw, setCurrentPw]     = useState('')
  const [newPw, setNewPw]             = useState('')
  const [confirmPw, setConfirmPw]     = useState('')
  const [pwSaving, setPwSaving]       = useState(false)
  const [pwResult, setPwResult]       = useState<{ ok?: string; err?: string }>({})

  // Timezone
  const [timezone, setTimezone]         = useState('')
  const [tzSaving, setTzSaving]         = useState(false)
  const [tzResult, setTzResult]         = useState<{ ok?: string; err?: string }>({})
  const [timezones, setTimezones]       = useState<string[]>([])

  // Connected accounts
  const [identities, setIdentities]     = useState<UserIdentity[]>([])
  const [unlinkingId, setUnlinkingId]   = useState<string | null>(null)
  const [unlinkResult, setUnlinkResult] = useState<{ ok?: string; err?: string }>({})

  // Organizations
  const [orgs, setOrgs]               = useState<any[]>([])
  const [leavingOrgId, setLeavingOrgId] = useState<string | null>(null)
  const [leaveResult, setLeaveResult] = useState<{ ok?: string; err?: string }>({})
  const [leavingInProgress, setLeavingInProgress] = useState<string | null>(null)

  // Delete account
  const [showDelete, setShowDelete]     = useState(false)
  const [deleteInput, setDeleteInput]   = useState('')
  const [deleting, setDeleting]         = useState(false)
  const [deleteError, setDeleteError]   = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then((res: any) => { const user = res.data?.user;
      if (!user) { router.push('/login'); return }
      setUser(user)
      setDisplayName(user.user_metadata?.full_name ?? '')
      setTimezone(user.user_metadata?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
      setIdentities(user.identities ?? [])
      setLoading(false)
    })

    fetch('/api/organizations/user')
      .then(r => r.ok ? r.json() : { data: [] })
      .then(({ data }) => setOrgs(data ?? []))

    try {
      setTimezones(Intl.supportedValuesOf('timeZone'))
    } catch {
      setTimezones(['UTC', 'America/New_York', 'America/Chicago', 'America/Denver',
        'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
        'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
        'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo',
        'Australia/Sydney', 'Pacific/Auckland'])
    }
  }, [])

  const hasEmailIdentity = identities.some(i => i.provider === 'email')

  // --- Profile save ---
  const saveProfile = async () => {
    setProfileSaving(true)
    setProfileResult({})
    const res = await fetch('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: displayName.trim() }),
    })
    setProfileResult(res.ok ? { ok: 'Display name saved.' } : { err: (await res.json()).error })
    setProfileSaving(false)
  }

  // --- Password save ---
  const savePassword = async () => {
    if (newPw !== confirmPw) { setPwResult({ err: 'Passwords do not match.' }); return }
    if (newPw.length < 6)    { setPwResult({ err: 'Password must be at least 6 characters.' }); return }
    setPwSaving(true)
    setPwResult({})

    if (hasEmailIdentity) {
      // Verify current password first
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user!.email!,
        password: currentPw,
      })
      if (signInErr) { setPwResult({ err: 'Current password is incorrect.' }); setPwSaving(false); return }
    }

    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) {
      setPwResult({ err: error.message })
    } else {
      setPwResult({ ok: hasEmailIdentity ? 'Password changed.' : 'Password set. You can now sign in with your email and password.' })
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    }
    setPwSaving(false)
  }

  // --- Timezone save ---
  const saveTimezone = async () => {
    setTzSaving(true)
    setTzResult({})
    const res = await fetch('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone }),
    })
    setTzResult(res.ok ? { ok: 'Timezone saved.' } : { err: (await res.json()).error })
    setTzSaving(false)
  }

  // --- Unlink identity ---
  const unlinkIdentity = async (identity: UserIdentity) => {
    if (identities.length <= 1) return
    setUnlinkingId(identity.id)
    setUnlinkResult({})
    const { error } = await supabase.auth.unlinkIdentity(identity)
    if (error) {
      setUnlinkResult({ err: error.message })
    } else {
      setIdentities(prev => prev.filter(i => i.id !== identity.id))
      setUnlinkResult({ ok: `${PROVIDER_LABELS[identity.provider] ?? identity.provider} disconnected.` })
    }
    setUnlinkingId(null)
  }

  // --- Leave org ---
  const leaveOrg = async (orgId: string) => {
    setLeavingInProgress(orgId)
    setLeaveResult({})
    const res = await fetch(`/api/organizations/${orgId}/leave`, { method: 'DELETE' })
    if (res.ok) {
      setOrgs(prev => prev.filter(o => o.id !== orgId))
      setLeaveResult({ ok: 'You have left the organization.' })
      await refreshOrganizations()
    } else {
      const { error } = await res.json()
      setLeaveResult({ err: error })
    }
    setLeavingOrgId(null)
    setLeavingInProgress(null)
  }

  // --- Delete account ---
  const deleteAccount = async () => {
    if (deleteInput !== 'DELETE') return
    setDeleting(true)
    setDeleteError(null)
    const res = await fetch('/api/users/me', { method: 'DELETE' })
    if (!res.ok) {
      const { error } = await res.json()
      setDeleteError(error)
      setDeleting(false)
      return
    }
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background dark:bg-gray-950">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background dark:bg-gray-950">
      <AdminNavigation />
      <main className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Account Settings</h1>

        {/* Profile */}
        <Card className="shadow-sm border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" /> Profile
            </CardTitle>
            <CardDescription>Your display name is shown to other members and doesn't need to be your real name.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="How you'd like to appear"
                maxLength={60}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={saveProfile} disabled={profileSaving} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                {profileSaving ? 'Saving…' : 'Save'}
              </Button>
              <SectionResult success={profileResult.ok ?? null} error={profileResult.err ?? null} />
            </div>
          </CardContent>
        </Card>

        {/* Password */}
        <Card className="shadow-sm border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Lock className="w-5 h-5 text-blue-600" />
              {hasEmailIdentity ? 'Change Password' : 'Set a Password'}
            </CardTitle>
            <CardDescription>
              {hasEmailIdentity
                ? 'Update your password. You\'ll need your current password to confirm.'
                : 'Add email & password sign-in to your account. Your Google/Microsoft login will still work.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasEmailIdentity && (
              <div className="space-y-1.5">
                <Label htmlFor="currentPw">Current Password</Label>
                <Input id="currentPw" type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="••••••••" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="newPw">{hasEmailIdentity ? 'New Password' : 'Password'}</Label>
              <Input id="newPw" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="••••••••" minLength={6} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPw">Confirm Password</Label>
              <Input id="confirmPw" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="••••••••" minLength={6} />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={savePassword} disabled={pwSaving} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                {pwSaving ? 'Saving…' : hasEmailIdentity ? 'Change Password' : 'Set Password'}
              </Button>
              <SectionResult success={pwResult.ok ?? null} error={pwResult.err ?? null} />
            </div>
          </CardContent>
        </Card>

        {/* Connected Accounts */}
        <Card className="shadow-sm border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="w-5 h-5 text-blue-600" /> Connected Accounts
            </CardTitle>
            <CardDescription>Sign-in methods linked to your account. You can disconnect a method as long as at least one remains.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {identities.map(identity => (
              <div key={identity.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  <ProviderIcon provider={identity.provider} />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {PROVIDER_LABELS[identity.provider] ?? identity.provider}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Connected {new Date(identity.created_at!).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {identities.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={unlinkingId === identity.id}
                    onClick={() => unlinkIdentity(identity)}
                    className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
                  >
                    {unlinkingId === identity.id ? 'Disconnecting…' : 'Disconnect'}
                  </Button>
                )}
              </div>
            ))}
            {unlinkResult.ok  && <p className="text-sm text-green-600 dark:text-green-400">{unlinkResult.ok}</p>}
            {unlinkResult.err && <p className="text-sm text-red-600 dark:text-red-400">{unlinkResult.err}</p>}
          </CardContent>
        </Card>

        {/* Organizations */}
        {orgs.length > 0 && (
          <Card className="shadow-sm border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <LeaveIcon className="w-5 h-5 text-blue-600" /> Organizations
              </CardTitle>
              <CardDescription>Organizations you belong to. You can leave any organization as long as you are not its sole owner.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {leaveResult.ok  && <p className="text-sm text-green-600 dark:text-green-400">{leaveResult.ok}</p>}
              {leaveResult.err && <p className="text-sm text-red-600 dark:text-red-400">{leaveResult.err}</p>}
              {orgs.map(org => {
                const initials = (org.name ?? '?').slice(0, 2).toUpperCase()
                const isSoleOwner = org.role === 'owner'
                const isConfirming = leavingOrgId === org.id
                return (
                  <div key={org.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-3 min-w-0">
                      {org.logo_url ? (
                        <img src={org.logo_url} alt={org.name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {initials}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{org.name}</p>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                          org.role === 'owner' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' :
                          org.role === 'admin' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' :
                          'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                        }`}>{org.role}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      {isConfirming ? (
                        <>
                          <span className="text-xs text-gray-600 dark:text-gray-400">Leave {org.name}?</span>
                          <Button size="sm" variant="outline"
                            onClick={() => leaveOrg(org.id)}
                            disabled={leavingInProgress === org.id}
                            className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20 text-xs"
                          >
                            {leavingInProgress === org.id ? 'Leaving…' : 'Yes, leave'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setLeavingOrgId(null)} className="text-xs">Cancel</Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isSoleOwner}
                          onClick={() => { setLeavingOrgId(org.id); setLeaveResult({}) }}
                          title={isSoleOwner ? 'Transfer ownership before leaving' : undefined}
                          className={isSoleOwner ? 'opacity-40 cursor-not-allowed' : 'text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20'}
                        >
                          Leave
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {/* Timezone */}
        <Card className="shadow-sm border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="w-5 h-5 text-blue-600" /> Timezone
            </CardTitle>
            <CardDescription>Used to display event times in your local timezone.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="timezone">Timezone</Label>
              <select
                id="timezone"
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
                className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {timezones.map(tz => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={saveTimezone} disabled={tzSaving} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                {tzSaving ? 'Saving…' : 'Save'}
              </Button>
              <SectionResult success={tzResult.ok ?? null} error={tzResult.err ?? null} />
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="shadow-sm border-red-200 dark:border-red-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-red-600 dark:text-red-400">
              <Trash2 className="w-5 h-5" /> Danger Zone
            </CardTitle>
            <CardDescription>Permanently delete your account and all associated data. This cannot be undone.</CardDescription>
          </CardHeader>
          <CardContent>
            {!showDelete ? (
              <Button
                variant="outline"
                onClick={() => setShowDelete(true)}
                className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
              >
                Delete Account
              </Button>
            ) : orgs.some((o: any) => o.role === 'owner') ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 space-y-1">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Ownership transfer required</p>
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    You are the owner of the following organization{orgs.filter((o: any) => o.role === 'owner').length !== 1 ? 's' : ''}:
                  </p>
                  <ul className="list-disc list-inside text-sm text-amber-700 dark:text-amber-400">
                    {orgs.filter((o: any) => o.role === 'owner').map((o: any) => (
                      <li key={o.id}>{o.name}</li>
                    ))}
                  </ul>
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    Transfer ownership to another member before deleting your account.
                  </p>
                </div>
                <Button variant="outline" onClick={() => { setShowDelete(false); setDeleteInput(''); setDeleteError(null) }}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Type <span className="font-mono font-bold">DELETE</span> to confirm.
                </p>
                <Input
                  value={deleteInput}
                  onChange={e => setDeleteInput(e.target.value)}
                  placeholder="DELETE"
                  className="max-w-xs font-mono"
                />
                {deleteError && <p className="text-sm text-red-600 dark:text-red-400">{deleteError}</p>}
                <div className="flex gap-2">
                  <Button
                    onClick={deleteAccount}
                    disabled={deleteInput !== 'DELETE' || deleting}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {deleting ? 'Deleting…' : 'Permanently Delete Account'}
                  </Button>
                  <Button variant="outline" onClick={() => { setShowDelete(false); setDeleteInput(''); setDeleteError(null) }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
