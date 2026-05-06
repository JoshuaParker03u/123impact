'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';
import AdminNavigation from '@/components/admin/AdminNavigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import {
  Upload, Link as LinkIcon, X, Loader2, Check, AlertTriangle,
  UserPlus, Users, Mail, RefreshCw, Trash2, Crown, Shield, User,
  Send, ChevronDown, ChevronUp,
} from 'lucide-react';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024;

// ── Logo editor ────────────────────────────────────────────────────────────────

function LogoEditor({ currentLogoUrl, onChange }) {
  const [tab, setTab]                 = useState('upload');
  const [file, setFile]               = useState(null);
  const [filePreview, setFilePreview] = useState('');
  const [urlValue, setUrlValue]       = useState('');
  const [dragOver, setDragOver]       = useState(false);
  const [fileError, setFileError]     = useState('');
  const fileInputRef = useRef(null);

  function handleFile(f) {
    setFileError('');
    if (!f) return;
    if (!ALLOWED_TYPES.includes(f.type)) { setFileError('Invalid type. Use JPG, PNG, SVG, or WebP.'); return; }
    if (f.size > MAX_SIZE) { setFileError('File too large. Max 5 MB.'); return; }
    setFile(f);
    setFilePreview(URL.createObjectURL(f));
    onChange({ type: 'file', file: f });
  }

  function clearFile() {
    setFile(null); setFilePreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    onChange({ type: 'none' });
  }

  function switchTab(t) {
    setTab(t); clearFile(); setUrlValue(''); onChange({ type: 'none' });
  }

  return (
    <div>
      {currentLogoUrl && !file && !urlValue && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <img src={currentLogoUrl} alt="Current logo" className="w-12 h-12 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Current logo</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Upload a new one to replace it</p>
          </div>
          <button type="button" onClick={() => onChange({ type: 'clear' })} className="text-gray-400 hover:text-red-500 transition-colors text-xs">
            Remove
          </button>
        </div>
      )}
      <div className="flex gap-1 mb-3 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        {['upload', 'url'].map((t) => (
          <button key={t} type="button" onClick={() => switchTab(t)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}>
            {t === 'upload' ? <Upload className="w-3.5 h-3.5" /> : <LinkIcon className="w-3.5 h-3.5" />}
            {t === 'upload' ? 'Upload File' : 'Image URL'}
          </button>
        ))}
      </div>
      {tab === 'upload' ? (
        <div>
          {file ? (
            <div className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
              <img src={filePreview} alt="Preview" className="w-12 h-12 rounded-lg object-cover" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</p>
                <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
              <button type="button" onClick={clearFile} className="text-gray-400 hover:text-red-500 transition-colors"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                         : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
              }`}>
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600 dark:text-gray-400">Drag & drop or <span className="text-blue-600 dark:text-blue-400 font-medium">browse</span></p>
              <p className="text-xs text-gray-500 mt-1">JPG, PNG, SVG, WebP — max 5 MB</p>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/svg+xml,image/webp" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
            </div>
          )}
          {fileError && <p className="text-red-600 text-sm mt-1">{fileError}</p>}
        </div>
      ) : (
        <div>
          <div className="flex gap-2">
            <input type="url" value={urlValue} onChange={(e) => { setUrlValue(e.target.value); onChange({ type: 'url', url: e.target.value }); }}
              placeholder="https://example.com/logo.png"
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm" />
            {urlValue && <button type="button" onClick={() => { setUrlValue(''); onChange({ type: 'none' }); }} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><X className="w-4 h-4" /></button>}
          </div>
          {urlValue && (
            <div className="mt-2 flex items-center gap-2">
              <img src={urlValue} alt="Preview" className="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-gray-700" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              <p className="text-xs text-gray-500 dark:text-gray-400">Preview</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Role helpers ───────────────────────────────────────────────────────────────

const ROLE_META = {
  owner:  { label: 'Owner',  icon: Crown,  colour: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  admin:  { label: 'Admin',  icon: Shield, colour: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  member: { label: 'Member', icon: User,   colour: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
};

function RoleBadge({ role }) {
  const meta = ROLE_META[role] ?? ROLE_META.member;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${meta.colour}`}>
      <Icon className="w-3 h-3" />{meta.label}
    </span>
  );
}

// ── Invite Modal ───────────────────────────────────────────────────────────────

function InviteModal({ orgId, onClose, onSent }) {
  const [email, setEmail]     = useState('');
  const [role, setRole]       = useState('member');
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState(null);
  const [pendingId, setPendingId] = useState(null); // existing pending invite id

  const valid = /\S+@\S+\.\S+/.test(email);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!valid) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/organizations/${orgId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'pending_exists') {
          setError({ type: 'pending', message: data.error, inviteId: data.invite_id });
          setPendingId(data.invite_id);
        } else if (data.code === 'already_member') {
          setError({ type: 'member', message: data.error });
        } else {
          setError({ type: 'generic', message: data.error ?? 'Failed to send invitation' });
        }
        return;
      }
      onSent();
      onClose();
    } finally {
      setSending(false);
    }
  }

  async function resendExisting() {
    if (!pendingId) return;
    setSending(true);
    setError(null);
    try {
      await fetch(`/api/organizations/${orgId}/invitations/${pendingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend' }),
      });
      onSent();
      onClose();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Invite Member</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email address</label>
            <input
              type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); setPendingId(null); }}
              placeholder="colleague@example.com" autoFocus
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Role</label>
            <div className="flex gap-2">
              {['member', 'admin'].map((r) => (
                <button key={r} type="button" onClick={() => setRole(r)}
                  className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors capitalize ${
                    role === r
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                  }`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-amber-800 dark:text-amber-300">
              <p>{error.message}</p>
              {error.type === 'pending' && (
                <button type="button" onClick={resendExisting} className="mt-2 text-blue-600 dark:text-blue-400 font-medium hover:underline">
                  Resend the existing invitation instead
                </button>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={!valid || sending} className="flex-1 bg-gradient-to-br from-blue-600 to-purple-600 hover:opacity-90 disabled:opacity-50">
              {sending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending…</> : <><Send className="w-4 h-4 mr-2" />Send Invitation</>}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// ── Members Tab ────────────────────────────────────────────────────────────────

function MembersTab({ org, currentUserId, userRole }) {
  const [members, setMembers]         = useState([]);
  const [invites, setInvites]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showExpired, setShowExpired] = useState(false);
  const [removingId, setRemovingId]   = useState(null);
  const [editRoleId, setEditRoleId]   = useState(null);

  const canManage = ['owner', 'admin'].includes(userRole);
  const isOwner   = userRole === 'owner';

  const load = useCallback(async () => {
    if (!org) return;
    setLoading(true);
    const [mRes, iRes] = await Promise.all([
      fetch(`/api/organizations/${org.id}/members`),
      fetch(`/api/organizations/${org.id}/invitations`),
    ]);
    if (mRes.ok) setMembers(await mRes.json());
    if (iRes.ok) setInvites(await iRes.json());
    setLoading(false);
  }, [org?.id]);

  useEffect(() => { load(); }, [load]);

  async function removeMember(userId, name) {
    if (!confirm(`Remove ${name || userId} from the organization?`)) return;
    setRemovingId(userId);
    const res = await fetch(`/api/organizations/${org.id}/members?user_id=${userId}`, { method: 'DELETE' });
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } else {
      const data = await res.json();
      alert(data.error ?? 'Failed to remove member');
    }
    setRemovingId(null);
  }

  async function updateInviteRole(inviteId, newRole) {
    const res = await fetch(`/api/organizations/${org.id}/invitations/${inviteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_role', role: newRole }),
    });
    if (res.ok) {
      const updated = await res.json();
      setInvites((prev) => prev.map((i) => i.id === inviteId ? updated : i));
    }
    setEditRoleId(null);
  }

  async function resendInvite(inviteId) {
    const res = await fetch(`/api/organizations/${org.id}/invitations/${inviteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resend' }),
    });
    if (res.ok) {
      const updated = await res.json();
      setInvites((prev) => prev.map((i) => i.id === inviteId ? { ...i, ...updated, inviter_name: i.inviter_name } : i));
    }
  }

  async function cancelInvite(inviteId, email) {
    if (!confirm(`Cancel this invitation to ${email}? They will no longer be able to use the invitation link.`)) return;
    const res = await fetch(`/api/organizations/${org.id}/invitations/${inviteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    });
    if (res.ok) {
      const updated = await res.json();
      setInvites((prev) => prev.map((i) => i.id === inviteId ? { ...i, ...updated } : i));
    }
  }

  const activeInvites  = invites.filter((i) => ['pending'].includes(i.status));
  const expiredInvites = invites.filter((i) => ['expired', 'cancelled', 'declined', 'accepted'].includes(i.status));

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Members */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Users className="w-4 h-4" /> Members ({members.length})
          </h2>
          {canManage && (
            <Button size="sm" onClick={() => setShowInviteModal(true)} className="bg-gradient-to-br from-blue-600 to-purple-600 hover:opacity-90">
              <UserPlus className="w-4 h-4 mr-2" /> Invite Member
            </Button>
          )}
        </div>
        <div className="divide-y dark:divide-gray-700">
          {members.map((m) => {
            const isCurrentUser = m.user_id === currentUserId;
            const canRemove = isOwner && !isCurrentUser && m.role !== 'owner';
            return (
              <div key={m.user_id} className="flex items-center gap-3 px-6 py-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                  {(m.name || m.email || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {m.name || m.email || m.user_id}
                    {isCurrentUser && <span className="ml-2 text-xs text-gray-400">(you)</span>}
                  </p>
                  {m.name && m.email && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{m.email}</p>}
                </div>
                <RoleBadge role={m.role} />
                {canRemove && (
                  <button
                    onClick={() => removeMember(m.user_id, m.name || m.email)}
                    disabled={removingId === m.user_id}
                    className="ml-2 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                    title="Remove member"
                  >
                    {removingId === m.user_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Active Invitations */}
      {(activeInvites.length > 0 || canManage) && (
        <Card className="overflow-hidden">
          <div className="px-6 py-4 border-b dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Mail className="w-4 h-4" /> Pending Invitations ({activeInvites.length})
            </h2>
          </div>
          {activeInvites.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 px-6 py-4">No pending invitations.</p>
          ) : (
            <div className="divide-y dark:divide-gray-700">
              {activeInvites.map((inv) => {
                const canAct = isOwner || inv.invited_by_me;
                return (
                  <div key={inv.id} className="px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{inv.email}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Invited by {inv.inviter_name} · Expires {new Date(inv.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                    {editRoleId === inv.id ? (
                      <div className="flex gap-1">
                        {['member', 'admin'].map((r) => (
                          <button key={r} onClick={() => updateInviteRole(inv.id, r)}
                            className={`px-2 py-1 rounded text-xs font-medium capitalize border transition-colors ${
                              inv.role === r ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-700' : 'border-gray-300 dark:border-gray-600 text-gray-600 hover:border-gray-400'
                            }`}>{r}</button>
                        ))}
                        <button onClick={() => setEditRoleId(null)} className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                      </div>
                    ) : (
                      <RoleBadge role={inv.role} />
                    )}
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => resendInvite(inv.id)} title="Resend" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors">
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setEditRoleId(inv.id)} title="Edit role" className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors">
                          <Shield className="w-3.5 h-3.5" />
                        </button>
                        {(isOwner || canAct) && (
                          <button onClick={() => cancelInvite(inv.id, inv.email)} title="Cancel" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Expired / history */}
      {expiredInvites.length > 0 && (
        <div>
          <button onClick={() => setShowExpired((v) => !v)} className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-2">
            {showExpired ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {showExpired ? 'Hide' : 'Show'} invitation history ({expiredInvites.length})
          </button>
          {showExpired && (
            <Card className="overflow-hidden opacity-70">
              <div className="divide-y dark:divide-gray-700">
                {expiredInvites.map((inv) => (
                  <div key={inv.id} className="px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{inv.email}</p>
                      <p className="text-xs text-gray-400">{inv.inviter_name}</p>
                    </div>
                    <RoleBadge role={inv.role} />
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                      inv.status === 'accepted'  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      inv.status === 'expired'   ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' :
                                                   'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                    }`}>{inv.status}</span>
                    {inv.status === 'expired' && canManage && (
                      <button onClick={() => resendInvite(inv.id)} title="Resend" className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors">
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {showInviteModal && (
        <InviteModal orgId={org.id} onClose={() => setShowInviteModal(false)} onSent={load} />
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function OrganizationsPage() {
  const { currentOrganization, loading: orgLoading, refreshOrganizations, userRole } = useOrganization();
  const router = useRouter();

  const [activeTab, setActiveTab]     = useState('settings');
  const [org, setOrg]                 = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [fetching, setFetching]       = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [saved, setSaved]             = useState(false);
  const [error, setError]             = useState('');
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting]       = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [logoChange, setLogoChange]   = useState({ type: 'none' });

  const [form, setForm] = useState({
    name: '', description: '', contact_email: '', contact_phone: '', website: '', status: 'active',
  });

  useEffect(() => {
    if (!currentOrganization) return;
    setFetching(true);
    setError('');
    setLogoChange({ type: 'none' });

    Promise.all([
      fetch(`/api/organizations/${currentOrganization.id}`).then((r) => r.json()),
      fetch('/api/organizations/user').then((r) => r.json()),
    ]).then(([orgResult, userResult]) => {
      if (orgResult.error || !orgResult.data) { setError(orgResult.error ?? 'Failed to load organization'); return; }
      setOrg(orgResult.data);
      setForm({
        name:          orgResult.data.name          ?? '',
        description:   orgResult.data.description   ?? '',
        contact_email: orgResult.data.contact_email ?? '',
        contact_phone: orgResult.data.contact_phone ?? '',
        website:       orgResult.data.website       ?? '',
        status:        orgResult.data.status        ?? 'active',
      });
      // Get current user id from org user list
      if (Array.isArray(userResult)) {
        // We can get the user id from the supabase browser client - handled below
      }
    }).catch((err) => setError(err.message)).finally(() => setFetching(false));

    // Get current user id
    import('@supabase/ssr').then(({ createBrowserClient }) => {
      const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      sb.auth.getUser().then(({ data: { user } }) => { if (user) setCurrentUserId(user.id); });
    });
  }, [currentOrganization?.id]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!org) return;
    setSubmitting(true); setError(''); setSaved(false);
    try {
      const fd = new FormData();
      fd.append('name', form.name.trim());
      fd.append('description', form.description.trim());
      fd.append('contact_email', form.contact_email.trim());
      fd.append('contact_phone', form.contact_phone.trim());
      fd.append('website', form.website.trim());
      fd.append('status', form.status);
      if (logoChange.type === 'file')  fd.append('logo_file', logoChange.file);
      else if (logoChange.type === 'url')   fd.append('logo_url', logoChange.url);
      else if (logoChange.type === 'clear') fd.append('clear_logo', 'true');

      const res = await fetch(`/api/organizations/${org.id}`, { method: 'PATCH', body: fd });
      const result = await res.json();
      if (!res.ok) { setError(result.error ?? 'Failed to save changes'); return; }
      setOrg(result.data); setLogoChange({ type: 'none' }); setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      await refreshOrganizations();
    } catch (err) {
      setError(err.message ?? 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!org) return;
    setDeleting(true); setDeleteError('');
    try {
      const res = await fetch(`/api/organizations/${org.id}`, { method: 'DELETE' });
      if (!res.ok) { const r = await res.json(); setDeleteError(r.error ?? 'Failed to delete organization'); return; }
      await refreshOrganizations();
      router.push('/dashboard');
    } catch (err) {
      setDeleteError(err.message ?? 'Unexpected error');
    } finally {
      setDeleting(false);
    }
  }

  if (orgLoading) {
    return (
      <>
        <AdminNavigation />
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </>
    );
  }

  if (!currentOrganization) {
    return (
      <>
        <AdminNavigation />
        <div className="container mx-auto px-4 py-8">
          <Card className="p-8 text-center">
            <p className="text-gray-600 dark:text-gray-400">No organization selected.</p>
          </Card>
        </div>
      </>
    );
  }

  const canManageSettings = ['owner', 'admin'].includes(userRole);

  return (
    <>
      <AdminNavigation />
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Organization</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{currentOrganization.name}</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 border-b dark:border-gray-700">
          {['settings', 'members'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}>
              {tab === 'settings' ? 'Settings' : 'Members'}
            </button>
          ))}
        </div>

        {/* Settings tab */}
        {activeTab === 'settings' && (
          <>
            {fetching ? (
              <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
            ) : (
              <Card className="p-6">
                {error && (
                  <div className="mb-5 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">{error}</div>
                )}
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Organization Name <span className="text-red-500">*</span></label>
                    <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} disabled={submitting || !canManageSettings} required
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                    <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} disabled={submitting || !canManageSettings} rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Logo <span className="text-gray-400 font-normal">(optional)</span></label>
                    <LogoEditor currentLogoUrl={logoChange.type === 'clear' ? null : org?.logo_url} onChange={setLogoChange} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Contact Email <span className="text-gray-400 font-normal">(optional)</span></label>
                      <input type="email" value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} disabled={submitting || !canManageSettings} placeholder="contact@org.com"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-50" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Contact Phone <span className="text-gray-400 font-normal">(optional)</span></label>
                      <input type="tel" value={form.contact_phone} onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))} disabled={submitting || !canManageSettings} placeholder="(555) 123-4567"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-50" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Website <span className="text-gray-400 font-normal">(optional)</span></label>
                    <input type="url" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} disabled={submitting || !canManageSettings} placeholder="https://yourorg.com"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Status</label>
                    <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} disabled={submitting || !canManageSettings}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  {canManageSettings && (
                    <div className="flex items-center gap-3 pt-2">
                      <Button type="submit" disabled={submitting} className="bg-gradient-to-br from-blue-600 to-purple-600 hover:opacity-90 disabled:opacity-50 px-8">
                        {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : 'Save Changes'}
                      </Button>
                      {saved && <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 font-medium"><Check className="w-4 h-4" /> Saved</span>}
                    </div>
                  )}
                </form>
              </Card>
            )}

            {!fetching && org?.role === 'owner' && (
              <Card className="mt-6 p-6 border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  <h2 className="text-lg font-semibold text-red-700 dark:text-red-400">Danger Zone</h2>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Permanently deletes this organization along with all its events, shifts, and volunteer registrations.
                </p>
                {deleteError && (
                  <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">{deleteError}</div>
                )}
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Type <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{org.name}</span> to confirm
                </p>
                <div className="flex gap-3">
                  <input type="text" value={deleteConfirmName} onChange={(e) => setDeleteConfirmName(e.target.value)} disabled={deleting} placeholder={org.name}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-red-500 disabled:opacity-50 text-sm" />
                  <Button type="button" onClick={handleDelete} disabled={deleting || deleteConfirmName !== org.name} className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 shrink-0">
                    {deleting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Deleting…</> : 'Delete Organization'}
                  </Button>
                </div>
              </Card>
            )}
          </>
        )}

        {/* Members tab */}
        {activeTab === 'members' && org && (
          <MembersTab org={org} currentUserId={currentUserId} userRole={userRole ?? currentOrganization.role} />
        )}
      </div>
    </>
  );
}
