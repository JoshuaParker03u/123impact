'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, Clock, Users } from 'lucide-react';
import Image from 'next/image';

type InviteData = {
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
  role: string;
  email: string;
  expires_at: string;
  inviter_name: string;
  organization: { name: string; logo_url: string | null };
};

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router    = useRouter();

  const [invite, setInvite]   = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser]       = useState<any>(null);
  const [acting, setActing]   = useState(false);
  const [done, setDone]       = useState<'accepted' | 'declined' | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const supabase = getBrowserClient();

  useEffect(() => {
    async function init() {
      // Exchange OAuth code if present (client-side PKCE exchange, same as dashboard)
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
        // Remove code from URL without triggering a reload
        window.history.replaceState({}, '', window.location.pathname);
      }

      const [{ data: { user: u } }, res] = await Promise.all([
        supabase.auth.getUser(),
        fetch(`/api/invite/${token}`),
      ]);

      if (!res.ok) {
        const err = await res.json();
        setApiError(err.error ?? 'not_found');
        setLoading(false);
        return;
      }

      const inviteData = await res.json();
      setInvite(inviteData);

      // If a different user is logged in, sign them out so the invitee must authenticate
      if (u && u.email?.toLowerCase() !== inviteData.email?.toLowerCase()) {
        await supabase.auth.signOut();
        setUser(null);
      } else {
        setUser(u);
      }

      setLoading(false);
    }
    init();
  }, [token]);

  async function handleAction(action: 'accept' | 'decline') {
    setActing(true);
    setApiError(null);
    try {
      const res = await fetch(`/api/invite/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'already_member') {
          setApiError(`You're already a member of ${data.org_name ?? 'this organization'}.`);
        } else {
          setApiError(data.error ?? 'Something went wrong.');
        }
        return;
      }
      if (action === 'accept') {
        setDone('accepted');
        // Full reload so OrganizationContext re-fetches and picks up the new membership
        setTimeout(() => { window.location.href = data.redirect ?? '/admin/organizations'; }, 2000);
      } else {
        setDone('declined');
        setTimeout(() => { window.location.href = data.redirect ?? '/'; }, 1500);
      }
    } finally {
      setActing(false);
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return <PageShell><Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto" /></PageShell>;
  }

  // ── Post-action states ────────────────────────────────────────────────────
  if (done === 'accepted') {
    return (
      <PageShell>
        <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Welcome aboard!</h1>
        <p className="text-gray-500">Redirecting you to the dashboard…</p>
      </PageShell>
    );
  }
  if (done === 'declined') {
    return (
      <PageShell>
        <XCircle className="w-14 h-14 text-gray-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Invitation declined</h1>
        <p className="text-gray-500">Redirecting you to the homepage…</p>
      </PageShell>
    );
  }

  // ── Error / terminal states ────────────────────────────────────────────────
  const terminalError = apiError || (invite && invite.status !== 'pending' ? invite.status : null);
  if (terminalError) {
    const messages: Record<string, string> = {
      not_found:  'This invitation link is invalid. Please check the link or contact the organization.',
      cancelled:  'This invitation is no longer active. Please contact the organization if you believe this is a mistake.',
      declined:   'This invitation is no longer active. Please contact the organization if you believe this is a mistake.',
      expired:    'This invitation has expired. Please contact the organization to request a new invitation.',
      accepted:   'This invitation has already been accepted.',
    };
    return (
      <PageShell>
        <XCircle className="w-14 h-14 text-red-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-3">Invitation unavailable</h1>
        <p className="text-gray-500 max-w-sm mx-auto">{messages[terminalError] ?? terminalError}</p>
      </PageShell>
    );
  }

  if (!invite) return null;

  const org = invite.organization;

  // ── Not logged in ─────────────────────────────────────────────────────────
  if (!user) {
    return (
      <PageShell>
        <OrgHeader org={org} />
        <p className="text-gray-600 dark:text-gray-400 mb-2 mt-4">
          <strong>{invite.inviter_name}</strong> has invited you to join as a{' '}
          <RolePill role={invite.role} />.
        </p>
        <p className="text-sm text-gray-500 mb-1">
          Sign in with <span className="font-medium text-gray-700 dark:text-gray-300">{invite.email}</span> to accept.
        </p>
        <p className="text-xs text-gray-400 mb-6">
          This invitation is tied to that email address.
        </p>
        <Button
          className="w-full bg-gradient-to-r from-blue-600 to-purple-600"
          onClick={() => router.push(`/login?redirect=/invite/${token}`)}
        >
          Sign in to accept
        </Button>
      </PageShell>
    );
  }

  // ── Logged in, pending ────────────────────────────────────────────────────
  return (
    <PageShell>
      <OrgHeader org={org} />
      <div className="mt-4 mb-6 space-y-1 text-gray-600 dark:text-gray-400">
        <p>
          <strong>{invite.inviter_name}</strong> has invited you to join as a <RolePill role={invite.role} />.
        </p>
        <p className="text-sm text-gray-500 mt-1">
          Invited: <span className="font-medium">{invite.email}</span>
        </p>
        <p className="text-sm text-gray-400 flex items-center gap-1 justify-center mt-1">
          <Clock className="w-3.5 h-3.5" />
          Expires {new Date(invite.expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {apiError && (
        <p className="text-red-600 text-sm mb-4">{apiError}</p>
      )}

      <div className="flex flex-col gap-3">
        <Button
          className="w-full bg-gradient-to-r from-blue-600 to-purple-600"
          disabled={acting}
          onClick={() => handleAction('accept')}
        >
          {acting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Accept Invitation
        </Button>
        <Button
          variant="outline"
          className="w-full"
          disabled={acting}
          onClick={() => handleAction('decline')}
        >
          Decline
        </Button>
      </div>
    </PageShell>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 text-center">
        {children}
      </Card>
    </main>
  );
}

function OrgHeader({ org }: { org: { name: string; logo_url: string | null } }) {
  return (
    <div className="flex flex-col items-center gap-3 mb-2">
      {org.logo_url ? (
        <Image src={org.logo_url} alt={org.name} width={64} height={64} className="rounded-full object-cover border" />
      ) : (
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
          <Users className="w-8 h-8 text-white" />
        </div>
      )}
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{org.name}</h1>
    </div>
  );
}

function RolePill({ role }: { role: string }) {
  const colours: Record<string, string> = {
    admin:  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    member: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${colours[role] ?? ''}`}>
      {role}
    </span>
  );
}
