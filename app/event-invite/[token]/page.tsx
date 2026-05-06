'use client';

import { useState, useEffect, type ReactElement } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, Calendar, MapPin, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { createBrowserClient } from '@supabase/ssr';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InviteData {
  assignment_id: string;
  status: string;
  email: string;
  expires_at: string;
  event: { id: string; title: string; date: string; location: string };
  org:   { name: string; logo_url: string | null };
  inviter_name: string;
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              123impact
            </span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EventInvitePage() {
  const { token } = useParams() as { token: string };
  const router = useRouter();

  const [invite, setInvite]       = useState<InviteData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState('');
  const [user, setUser]           = useState<any>(null);
  const [acting, setActing]       = useState(false);
  const [done, setDone]           = useState<'accepted' | 'declined' | null>(null);
  const [actionError, setActionError] = useState('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    async function init() {
      // Check auth
      const { data: { user: u } } = await supabase.auth.getUser();
      setUser(u);

      // Load invite
      const res = await fetch(`/api/event-invite/${token}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setLoadError(d.error || 'Invalid invitation link');
        setLoading(false);
        return;
      }
      setInvite(await res.json());
      setLoading(false);
    }
    init();
  }, [token]);

  async function act(action: 'accept' | 'decline') {
    setActing(true);
    setActionError('');
    const res = await fetch(`/api/event-invite/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    setActing(false);

    if (!res.ok) {
      setActionError(data.error || 'Something went wrong');
      return;
    }

    if (action === 'accept') {
      setDone('accepted');
      setTimeout(() => router.push(`/admin/events/${invite!.event.id}`), 2000);
    } else {
      setDone('declined');
    }
  }

  // Loading
  if (loading) {
    return (
      <PageShell>
        <Card className="p-10 text-center">
          <Loader2 className="w-7 h-7 animate-spin text-blue-500 mx-auto" />
        </Card>
      </PageShell>
    );
  }

  // Invalid / not found
  if (loadError) {
    return (
      <PageShell>
        <Card className="p-8 text-center">
          <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-gray-800 dark:text-gray-200 font-medium">{loadError}</p>
          <p className="text-sm text-gray-500 mt-1">This link may be invalid or has already been used.</p>
        </Card>
      </PageShell>
    );
  }

  // Terminal statuses
  if (invite!.status !== 'pending') {
    const msgs: Record<string, { icon: ReactElement; heading: string; sub: string }> = {
      expired:  { icon: <AlertTriangle className="w-10 h-10 text-yellow-400 mx-auto mb-3" />, heading: 'Invitation expired', sub: 'Contact the event organizer to receive a new invitation.' },
      accepted: { icon: <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />,  heading: 'Already accepted',  sub: 'You already have Event Admin access for this event.' },
      revoked:  { icon: <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />,         heading: 'Invitation cancelled', sub: 'This invitation is no longer valid. Contact the organizer if this is unexpected.' },
      void:     { icon: <XCircle className="w-10 h-10 text-gray-400 mx-auto mb-3" />,         heading: 'Invitation void', sub: 'The event associated with this invitation no longer exists.' },
    };
    const m = msgs[invite!.status] ?? msgs.void;
    return (
      <PageShell>
        <Card className="p-8 text-center">
          {m.icon}
          <p className="text-gray-800 dark:text-gray-200 font-medium">{m.heading}</p>
          <p className="text-sm text-gray-500 mt-1">{m.sub}</p>
        </Card>
      </PageShell>
    );
  }

  // Done state
  if (done === 'accepted') {
    return (
      <PageShell>
        <Card className="p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">You're in!</p>
          <p className="text-sm text-gray-500 mt-1">Redirecting to the event…</p>
        </Card>
      </PageShell>
    );
  }

  if (done === 'declined') {
    return (
      <PageShell>
        <Card className="p-8 text-center">
          <XCircle className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-800 dark:text-gray-200 font-medium">Invitation declined</p>
          <p className="text-sm text-gray-500 mt-1">You can close this page.</p>
        </Card>
      </PageShell>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <PageShell>
        <Card className="p-8">
          {/* Org header */}
          <div className="flex items-center gap-3 mb-5">
            {invite!.org.logo_url ? (
              <img src={invite!.org.logo_url} alt={invite!.org.name} className="w-11 h-11 rounded-xl object-cover" />
            ) : (
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                {invite!.org.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{invite!.org.name}</p>
              <p className="text-xs text-gray-500">is inviting you to manage an event</p>
            </div>
          </div>

          <div className="border dark:border-gray-700 rounded-xl p-4 mb-5 space-y-2">
            <p className="font-semibold text-gray-900 dark:text-gray-100">{invite!.event.title}</p>
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <Calendar className="w-4 h-4" />
              {new Date(invite!.event.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <MapPin className="w-4 h-4" />
              {invite!.event.location}
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl px-4 py-3 mb-5">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <strong>{invite!.inviter_name}</strong> invited you as <strong>Event Admin</strong>.
            </p>
            <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">
              Access expires {new Date(invite!.expires_at).toLocaleDateString()}
            </p>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 text-center">
            Sign in or create an account to accept this invitation.
          </p>
          <Button
            className="w-full"
            onClick={() => router.push(`/login?redirect=/event-invite/${token}`)}
          >
            Sign in to Accept
          </Button>
        </Card>
      </PageShell>
    );
  }

  // Logged in — show accept/decline
  return (
    <PageShell>
      <Card className="p-8">
        <div className="flex items-center gap-3 mb-5">
          {invite!.org.logo_url ? (
            <img src={invite!.org.logo_url} alt={invite!.org.name} className="w-11 h-11 rounded-xl object-cover" />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
              {invite!.org.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-semibold text-gray-900 dark:text-gray-100">{invite!.org.name}</p>
            <p className="text-xs text-gray-500">Event Admin Invitation</p>
          </div>
        </div>

        <div className="border dark:border-gray-700 rounded-xl p-4 mb-5 space-y-2">
          <p className="font-semibold text-gray-900 dark:text-gray-100">{invite!.event.title}</p>
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <Calendar className="w-4 h-4" />
            {new Date(invite!.event.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <MapPin className="w-4 h-4" />
            {invite!.event.location}
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl px-4 py-3 mb-5">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <strong>{invite!.inviter_name}</strong> invited you as <strong>Event Admin</strong>.
          </p>
          <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">
            Access expires {new Date(invite!.expires_at).toLocaleDateString()}
          </p>
        </div>

        {actionError && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 mb-4">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {actionError}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => act('decline')}
            disabled={acting}
          >
            Decline
          </Button>
          <Button
            className="flex-1"
            onClick={() => act('accept')}
            disabled={acting}
          >
            {acting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Accept
          </Button>
        </div>
      </Card>
    </PageShell>
  );
}
