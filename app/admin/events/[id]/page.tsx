'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import AdminNavigation from '@/components/admin/AdminNavigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import AnalyticsTab from './AnalyticsTab';
import LiveTab from './LiveTab';
import {
  Calendar, MapPin, Clock, Users, ChevronDown, ChevronUp,
  Mail, FileText, ArrowLeft, Loader2, ShieldCheck, Plus,
  Trash2, RefreshCw, Pencil, X, Crown, Shield, User,
  AlertTriangle, QrCode, Download, BarChart2, Radio, Link2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Volunteer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  registered_at: string;
}

interface Shift {
  id: string;
  shift_id: number;
  name: string;
  description: string | null;
  start_time: string;
  end_time: string;
  capacity: number;
  filled: number;
  volunteers?: Volunteer[];
}

interface Event {
  id: string;
  event_id: string;
  title: string;
  description: string | null;
  date: string;
  time: string;
  location: string;
  image_url: string | null;
  status: string;
  organization_id: string;
  shifts: Shift[];
}

interface OrgMember {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
}

interface Assignment {
  id: string;
  event_id: string;
  user_id: string | null;
  email: string;
  status: 'active' | 'pending' | 'expired' | 'revoked' | 'void';
  expires_at: string;
  invited_by: string;
  user_name: string | null;
  user_avatar: string | null;
  inviter_name: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadge(status: Assignment['status']) {
  const map: Record<string, string> = {
    active:  'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    pending: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
    expired: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
    revoked: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    void:    'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${map[status] ?? ''}`}>
      {status}
    </span>
  );
}

function roleIcon(role: string) {
  if (role === 'owner') return <Crown className="w-3.5 h-3.5 text-purple-500" />;
  if (role === 'admin') return <Shield className="w-3.5 h-3.5 text-blue-500" />;
  return <User className="w-3.5 h-3.5 text-gray-400" />;
}

// ---------------------------------------------------------------------------
// Add Event Admin Modal
// ---------------------------------------------------------------------------

function AddAdminModal({
  eventId,
  orgId,
  defaultExpiry,
  onClose,
  onAdded,
}: {
  eventId: string;
  orgId: string;
  defaultExpiry: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [query, setQuery]           = useState('');
  const [members, setMembers]       = useState<OrgMember[]>([]);
  const [filtered, setFiltered]     = useState<OrgMember[]>([]);
  const [selected, setSelected]     = useState<OrgMember | null>(null);
  const [externalEmail, setExternalEmail] = useState('');
  const [expiresAt, setExpiresAt]   = useState(defaultExpiry);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [membersLoaded, setMembersLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/organizations/${orgId}/members`)
      .then((r) => r.json())
      .then((data) => { setMembers(Array.isArray(data) ? data : []); setMembersLoaded(true); });
    inputRef.current?.focus();
  }, [orgId]);

  useEffect(() => {
    if (!query.trim()) { setFiltered([]); return; }
    const q = query.toLowerCase();
    setFiltered(
      members.filter(
        (m) =>
          m.email?.toLowerCase().includes(q) ||
          m.name?.toLowerCase().includes(q)
      ).slice(0, 6)
    );
  }, [query, members]);

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const isExternal   = membersLoaded && !selected && isValidEmail(query) && filtered.length === 0;

  async function submit() {
    setError('');
    const email = selected ? selected.email : query.trim();
    if (!email || !isValidEmail(email)) { setError('Enter a valid email'); return; }
    if (!expiresAt) { setError('Set an expiry date'); return; }

    setSubmitting(true);
    const res = await fetch(`/api/events/${eventId}/admins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        expires_at: new Date(expiresAt).toISOString(),
        user_id: selected?.user_id ?? null,
      }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error || 'Something went wrong');
      return;
    }
    onAdded();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b dark:border-gray-800">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Add Event Admin</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Search / email field */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Search member or enter email
            </label>
            {selected ? (
              <div className="flex items-center gap-2 px-3 py-2 border border-blue-300 dark:border-blue-600 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                {roleIcon(selected.role)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {selected.name || selected.email}
                  </p>
                  {selected.name && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{selected.email}</p>
                  )}
                </div>
                <button onClick={() => { setSelected(null); setQuery(''); }} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Name or email…"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {filtered.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
                    {filtered.map((m) => (
                      <li key={m.user_id}>
                        <button
                          onClick={() => { setSelected(m); setQuery(''); setFiltered([]); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          {roleIcon(m.role)}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                              {m.name || m.email}
                            </p>
                            {m.name && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{m.email}</p>
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {isExternal && (
              <p className="mt-1.5 text-xs text-blue-600 dark:text-blue-400">
                Not an org member — an invitation email will be sent.
              </p>
            )}
          </div>

          {/* Expiry */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Access expires
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-400">Default: event end date + 5 days</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t dark:border-gray-800">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || (!selected && !isValidEmail(query))}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {isExternal ? 'Send Invitation' : 'Add Admin'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit Expiry Modal
// ---------------------------------------------------------------------------

function EditExpiryModal({
  assignment,
  eventId,
  onClose,
  onSaved,
}: {
  assignment: Assignment;
  eventId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const current = assignment.expires_at.split('T')[0];
  const [expiresAt, setExpiresAt] = useState(current);
  const [saving, setSaving]       = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`/api/events/${eventId}/admins/${assignment.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_expiry', expires_at: new Date(expiresAt).toISOString() }),
    });
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b dark:border-gray-800">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Edit Expiry</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="px-6 py-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Updating expiry for <strong>{assignment.user_name || assignment.email}</strong>
          </p>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t dark:border-gray-800">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event Admins Tab
// ---------------------------------------------------------------------------

function EventAdminsTab({
  eventId,
  orgId,
  orgPlan,
  defaultExpiry,
}: {
  eventId: string;
  orgId: string;
  orgPlan: string;
  defaultExpiry: string;
}) {
  const [assignments, setAssignments]     = useState<Assignment[]>([]);
  const [loading, setLoading]             = useState(true);
  const [showAddModal, setShowAddModal]   = useState(false);
  const [editTarget, setEditTarget]       = useState<Assignment | null>(null);
  const [revoking, setRevoking]           = useState<string | null>(null);
  const [resending, setResending]         = useState<string | null>(null);

  const isPaid = orgPlan !== 'free';

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/events/${eventId}/admins`);
    if (res.ok) setAssignments(await res.json());
    setLoading(false);
  }

  useEffect(() => { if (isPaid) load(); else setLoading(false); }, [isPaid, eventId]);

  async function revoke(id: string) {
    setRevoking(id);
    await fetch(`/api/events/${eventId}/admins/${id}`, { method: 'DELETE' });
    setRevoking(null);
    load();
  }

  async function resend(id: string) {
    setResending(id);
    await fetch(`/api/events/${eventId}/admins/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resend' }),
    });
    setResending(null);
  }

  const active  = assignments.filter((a) => ['active', 'pending'].includes(a.status));
  const history = assignments.filter((a) => ['expired', 'revoked', 'void'].includes(a.status));

  if (!isPaid) {
    return (
      <Card className="p-8 text-center">
        <ShieldCheck className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">Event Admin is a paid feature</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Upgrade your plan to assign Event Admins and enable cross-organization collaboration.
        </p>
        <Button variant="outline" disabled>Add Event Admin</Button>
      </Card>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Event Admins can view registrations and manage check-ins for this event only.
        </p>
        <Button onClick={() => setShowAddModal(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Add Event Admin
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : (
        <>
          {active.length === 0 ? (
            <Card className="p-8 text-center text-gray-500 dark:text-gray-400">
              No Event Admins assigned yet.
            </Card>
          ) : (
            <div className="space-y-2">
              {active.map((a) => {
                const expired = new Date(a.expires_at) < new Date();
                return (
                  <Card key={a.id} className="px-5 py-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {a.user_name || a.email}
                          </p>
                          {statusBadge(a.status)}
                        </div>
                        {a.user_name && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{a.email}</p>
                        )}
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          Invited by {a.inviter_name} &middot; Expires{' '}
                          <span className={expired ? 'text-red-500' : ''}>
                            {new Date(a.expires_at).toLocaleDateString()}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {a.status === 'pending' && (
                          <button
                            onClick={() => resend(a.id)}
                            disabled={resending === a.id}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            title="Resend invitation"
                          >
                            {resending === a.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <RefreshCw className="w-3.5 h-3.5" />}
                            Resend
                          </button>
                        )}
                        <button
                          onClick={() => setEditTarget(a)}
                          className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                          title="Edit expiry"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => revoke(a.id)}
                          disabled={revoking === a.id}
                          className="p-1.5 rounded-lg border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Revoke access"
                        >
                          {revoking === a.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {history.length > 0 && (
            <details className="mt-6">
              <summary className="text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none">
                Show history ({history.length})
              </summary>
              <div className="mt-2 space-y-2">
                {history.map((a) => (
                  <Card key={a.id} className="px-5 py-3 opacity-70">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {a.user_name || a.email}
                          </p>
                          {statusBadge(a.status)}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Invited by {a.inviter_name} &middot; Expired {new Date(a.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {showAddModal && (
        <AddAdminModal
          eventId={eventId}
          orgId={orgId}
          defaultExpiry={defaultExpiry}
          onClose={() => setShowAddModal(false)}
          onAdded={load}
        />
      )}

      {editTarget && (
        <EditExpiryModal
          assignment={editTarget}
          eventId={eventId}
          onClose={() => setEditTarget(null)}
          onSaved={load}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// QR Codes Tab
// ---------------------------------------------------------------------------

interface QRInstance {
  id: string;
  label: string;
  ref_token: string;
  is_active: boolean;
  scan_count: number;
  created_at: string;
  type: 'qr' | 'link';
}

function QRCodesTab({ eventId }: { eventId: string }) {
  const [instances, setInstances]         = useState<QRInstance[]>([]);
  const [eventSlug, setEventSlug]         = useState('');
  const [loading, setLoading]             = useState(true);
  const [adding, setAdding]               = useState(false);
  const [newLabel, setNewLabel]           = useState('');
  const [showAddForm, setShowAddForm]     = useState<'qr' | 'link' | null>(null);
  const [regenerating, setRegenerating]   = useState<string | null>(null);
  const [previewId, setPreviewId]         = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/events/${eventId}/qr-instances`);
    if (res.ok) {
      const json = await res.json();
      setInstances(json.instances ?? []);
      setEventSlug(json.event_slug ?? '');
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  function signupUrl(refToken: string) {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    return `${base}/events/${eventSlug}/signup?ref=${refToken}`;
  }

  function downloadPng(refToken: string, label: string) {
    const canvas = document.getElementById(`qr-canvas-${refToken}`) as HTMLCanvasElement | null;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-${label.replace(/\s+/g, '-').toLowerCase()}.png`;
    a.click();
  }

  function downloadSvg(refToken: string, label: string) {
    const svgEl = document.getElementById(`qr-svg-${refToken}`) as SVGElement | null;
    if (!svgEl) return;
    const blob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `qr-${label.replace(/\s+/g, '-').toLowerCase()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function addInstance() {
    if (!newLabel.trim() || !showAddForm) return;
    setAdding(true);
    const res = await fetch(`/api/events/${eventId}/qr-instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newLabel.trim(), type: showAddForm }),
    });
    setAdding(false);
    if (res.ok) {
      setNewLabel('');
      setShowAddForm(null);
      load();
    }
  }

  async function regenerate(instanceId: string) {
    if (!confirm('Regenerate this QR code? The old code will stop working immediately.')) return;
    setRegenerating(instanceId);
    const res = await fetch(`/api/events/${eventId}/qr-instances/${instanceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'regenerate' }),
    });
    setRegenerating(null);
    if (res.ok) load();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  const active = instances.filter((i) => i.is_active);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          QR placements and tracking links — all scans/clicks tracked anonymously (date only, no PII).
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAddForm('link')} className="gap-1.5 text-sm">
            <Link2 className="w-4 h-4" /> Tracking Link
          </Button>
          <Button onClick={() => setShowAddForm('qr')} className="gap-1.5 text-sm">
            <Plus className="w-4 h-4" /> QR Placement
          </Button>
        </div>
      </div>

      {showAddForm && (
        <Card className="p-4 mb-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {showAddForm === 'link' ? 'Tracking link label' : 'Placement label'}
            </label>
            <input
              autoFocus
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addInstance()}
              placeholder={showAddForm === 'link' ? 'e.g. April newsletter, Instagram bio' : 'e.g. Front Entrance, Parking Lot'}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button onClick={addInstance} disabled={adding || !newLabel.trim()}>
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
          </Button>
          <Button variant="outline" onClick={() => { setShowAddForm(null); setNewLabel(''); }}>
            Cancel
          </Button>
        </Card>
      )}

      {active.length === 0 ? (
        <Card className="p-8 text-center text-gray-500 dark:text-gray-400">
          No QR placements yet. Add one to get started.
        </Card>
      ) : (
        <div className="space-y-3">
          {active.map((inst) => {
            const url    = signupUrl(inst.ref_token);
            const isLink = inst.type === 'link';
            return (
              <Card key={inst.id} className="p-5">
                <div className="flex items-start gap-5 flex-wrap">
                  {/* QR preview (only for qr type) */}
                  {!isLink && (
                    <div className="flex flex-col items-center gap-2 flex-shrink-0">
                      <div className="hidden">
                        <QRCodeCanvas id={`qr-canvas-${inst.ref_token}`} value={url} size={512} level="M" />
                        <QRCodeSVG   id={`qr-svg-${inst.ref_token}`}   value={url} size={512} level="M" />
                      </div>
                      {previewId === inst.id ? (
                        <div className="cursor-pointer" onClick={() => setPreviewId(null)} title="Click to hide">
                          <QRCodeSVG value={url} size={120} level="M" />
                        </div>
                      ) : (
                        <button
                          onClick={() => setPreviewId(inst.id)}
                          className="w-[120px] h-[120px] border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg flex items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
                        >
                          <QrCode className="w-10 h-10" />
                        </button>
                      )}
                      <span className="text-xs text-gray-400">
                        {previewId === inst.id ? 'Click to hide' : 'Click to preview'}
                      </span>
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{inst.label}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        isLink
                          ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                          : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      }`}>
                        {isLink ? 'Tracking Link' : 'QR Code'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      {inst.scan_count} {isLink ? 'click' : 'scan'}{inst.scan_count !== 1 ? 's' : ''} &middot;{' '}
                      Created {new Date(inst.created_at).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate font-mono">{url}</p>
                    {isLink && (
                      <button
                        onClick={() => navigator.clipboard.writeText(url)}
                        className="mt-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Copy link
                      </button>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!isLink && (
                      <>
                        <button
                          onClick={() => downloadPng(inst.ref_token, inst.label)}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                          title="Download PNG"
                        >
                          <Download className="w-3.5 h-3.5" />PNG
                        </button>
                        <button
                          onClick={() => downloadSvg(inst.ref_token, inst.label)}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                          title="Download SVG"
                        >
                          <Download className="w-3.5 h-3.5" />SVG
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => regenerate(inst.id)}
                      disabled={regenerating === inst.id}
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                      title="Regenerate (invalidates old token)"
                    >
                      {regenerating === inst.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Regenerate
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Personal check-in note */}
      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-sm text-blue-700 dark:text-blue-300">
        <strong>Personal check-in codes</strong> — Each registrant also has their own unique QR code
        for check-in on event day. Staff can scan it at the door. No setup required.
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminEventDetailPage() {
  const params  = useParams();
  const router  = useRouter();
  const eventId = params.id as string;

  const [event,   setEvent]   = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loadingVolunteers, setLoadingVolunteers] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'shifts' | 'admins' | 'qr' | 'analytics' | 'live'>('shifts');
  const [userRole, setUserRole]   = useState<string | null>(null);
  const [orgPlan, setOrgPlan]     = useState<string>('free');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => { loadEvent(); }, []);

  async function loadEvent() {
    setLoading(true);

    const { data, error } = await supabase
      .from('events')
      .select(`
        id, event_id, title, description, date, time,
        location, image_url, status, organization_id,
        shifts (
          id, shift_id, name, description,
          start_time, end_time, capacity
        )
      `)
      .eq('event_id', eventId)
      .single();

    if (error || !data) {
      console.error('Error loading event:', error);
      setLoading(false);
      return;
    }

    // Fetch org plan separately — column may not exist until migration runs
    const { data: orgData } = await supabase
      .from('organizations')
      .select('plan')
      .eq('id', (data as any).organization_id)
      .maybeSingle();
    setOrgPlan((orgData as any)?.plan ?? 'free');

    const shiftIds = (data.shifts ?? []).map((s) => s.id);
    const { data: regRows } = await supabase
      .from('volunteer_registrations')
      .select('shift_id')
      .in('shift_id', shiftIds);

    const countMap = (regRows ?? []).reduce<Record<string, number>>((acc, r) => {
      acc[r.shift_id] = (acc[r.shift_id] ?? 0) + 1;
      return acc;
    }, {});

    const sorted = [...(data.shifts ?? [])]
      .map((s) => ({ ...s, filled: countMap[s.id] ?? 0 }))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    setEvent({ ...data, shifts: sorted } as Event);

    // Load current user's org role
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: membership } = await supabase
        .from('organization_admins')
        .select('role')
        .eq('organization_id', (data as any).organization_id)
        .eq('user_id', user.id)
        .single();
      setUserRole(membership?.role ?? null);
    }

    setLoading(false);
  }

  async function toggleShift(shiftId: string) {
    if (expanded === shiftId) {
      setExpanded(null);
      return;
    }

    const shift = event?.shifts.find((s) => s.id === shiftId);
    if (shift && !shift.volunteers) {
      setLoadingVolunteers(shiftId);
      const { data } = await supabase
        .from('volunteer_registrations')
        .select('id, name, email, phone, registered_at')
        .eq('shift_id', shiftId)
        .order('registered_at', { ascending: true });

      setEvent((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          shifts: prev.shifts.map((s) =>
            s.id === shiftId ? { ...s, volunteers: data ?? [] } : s
          ),
        };
      });
      setLoadingVolunteers(null);
    }

    setExpanded(shiftId);
  }

  // Compute default expiry: latest shift end + 5 days, or event date + 5 days
  function defaultExpiry(): string {
    try {
      if (!event) throw new Error('no event');
      let base: Date | null = null;
      if (event.shifts.length > 0) {
        const latest = event.shifts.reduce((max, s) =>
          new Date(s.end_time) > new Date(max.end_time) ? s : max
        );
        const d = new Date(latest.end_time);
        if (!isNaN(d.getTime())) base = d;
      }
      if (!base) {
        const d = new Date(event.date);
        if (!isNaN(d.getTime())) base = d;
      }
      if (!base) throw new Error('invalid date');
      base.setDate(base.getDate() + 5);
      return base.toISOString().split('T')[0];
    } catch {
      // Fallback: 7 days from today
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d.toISOString().split('T')[0];
    }
  }

  const canManageAdmins = userRole === 'owner' || userRole === 'admin';

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <>
        <AdminNavigation />
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </>
    );
  }

  if (!event) {
    return (
      <>
        <AdminNavigation />
        <div className="container mx-auto px-4 py-8">
          <Card className="p-8 text-center">
            <p className="text-gray-600">Event not found.</p>
            <Button className="mt-4" onClick={() => router.push('/admin/events')}>
              Back to Events
            </Button>
          </Card>
        </div>
      </>
    );
  }

  const totalFilled   = event.shifts.reduce((s, sh) => s + (sh.filled ?? 0), 0);
  const totalCapacity = event.shifts.reduce((s, sh) => s + sh.capacity, 0);
  const fillPct       = totalCapacity > 0 ? Math.round((totalFilled / totalCapacity) * 100) : 0;

  return (
    <>
      <AdminNavigation />
      <div className="container mx-auto px-4 py-8">

        {/* Back link */}
        <Link
          href="/admin/events"
          className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Events
        </Link>

        {/* Event header */}
        <Card className="p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{event.title}</h1>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  event.status === 'active'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  {event.status}
                </span>
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400 mt-2">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />{event.date}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />{event.time}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />{event.location}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {totalFilled}/{totalCapacity} volunteers ({fillPct}% full)
                </span>
              </div>

              {event.description && (
                <p className="mt-3 text-gray-700 dark:text-gray-300">{event.description}</p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 shrink-0">
              <Link href={`/admin/events/${event.id}/templates`}>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <FileText className="w-4 h-4" /> Email Templates
                </Button>
              </Link>
              <Link href={`/admin/messages?eventId=${event.id}`}>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Mail className="w-4 h-4" /> Message Volunteers
                </Button>
              </Link>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        {(() => {
          const isToday = event.date === new Date().toISOString().split('T')[0];
          const tabClass = (active: boolean) =>
            `flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              active
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`;
          return (
            <div className="flex overflow-x-auto border-b border-gray-200 dark:border-gray-700 mb-6">
              <button onClick={() => setActiveTab('shifts')} className={tabClass(activeTab === 'shifts')}>
                Shifts ({event.shifts.length})
              </button>
              <button onClick={() => setActiveTab('analytics')} className={tabClass(activeTab === 'analytics')}>
                <BarChart2 className="w-4 h-4" />Analytics
              </button>
              {isToday && (
                <button onClick={() => setActiveTab('live')} className={tabClass(activeTab === 'live')}>
                  <Radio className="w-4 h-4" />Live
                </button>
              )}
              <button onClick={() => setActiveTab('qr')} className={tabClass(activeTab === 'qr')}>
                <QrCode className="w-4 h-4" />Marketing
              </button>
              {canManageAdmins && (
                <button onClick={() => setActiveTab('admins')} className={tabClass(activeTab === 'admins')}>
                  <ShieldCheck className="w-4 h-4" />Event Admins
                </button>
              )}
            </div>
          );
        })()}

        {/* Tab content */}
        {activeTab === 'admins' && canManageAdmins ? (
          <EventAdminsTab
            eventId={event.id}
            orgId={event.organization_id}
            orgPlan={orgPlan}
            defaultExpiry={defaultExpiry()}
          />
        ) : activeTab === 'analytics' ? (
          <AnalyticsTab eventId={event.id} />
        ) : activeTab === 'live' ? (
          <LiveTab eventId={event.id} />
        ) : activeTab === 'qr' ? (
          <QRCodesTab eventId={event.id} />
        ) : (
          <>
            {!canManageAdmins && (
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Shifts ({event.shifts.length})
              </h2>
            )}

            {event.shifts.length === 0 ? (
              <Card className="p-8 text-center text-gray-500">
                No shifts added yet.
              </Card>
            ) : (
              <div className="space-y-3">
                {event.shifts.map((shift) => {
                  const isOpen   = expanded === shift.id;
                  const isFull   = (shift.filled ?? 0) >= shift.capacity;
                  const start    = new Date(shift.start_time);
                  const end      = new Date(shift.end_time);

                  return (
                    <Card key={shift.id} className="overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        onClick={() => toggleShift(shift.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-gray-100">{shift.name}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                            {start.toLocaleDateString()} &nbsp;
                            {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {' – '}
                            {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          {shift.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{shift.description}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-3 ml-4">
                          <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                            isFull
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                          }`}>
                            {shift.filled ?? 0}/{shift.capacity}
                          </span>
                          {loadingVolunteers === shift.id
                            ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                            : isOpen
                              ? <ChevronUp className="w-4 h-4 text-gray-400" />
                              : <ChevronDown className="w-4 h-4 text-gray-400" />
                          }
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t dark:border-gray-700 px-5 py-4 bg-gray-50 dark:bg-gray-800/50">
                          {!shift.volunteers || shift.volunteers.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">No volunteers registered yet.</p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                                  <th className="pb-2 font-medium">Name</th>
                                  <th className="pb-2 font-medium">Email</th>
                                  <th className="pb-2 font-medium">Phone</th>
                                  <th className="pb-2 font-medium">Registered</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {shift.volunteers.map((v) => (
                                  <tr key={v.id} className="text-gray-700 dark:text-gray-300">
                                    <td className="py-2 pr-4 font-medium">{v.name}</td>
                                    <td className="py-2 pr-4">{v.email}</td>
                                    <td className="py-2 pr-4">{v.phone ?? '—'}</td>
                                    <td className="py-2 text-gray-400 dark:text-gray-500">
                                      {new Date(v.registered_at).toLocaleDateString()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
