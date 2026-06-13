'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { getBrowserClient } from '@/lib/supabase';
import AdminNavigation from '@/components/admin/AdminNavigation';
import CreateOrganizationModal from '@/components/admin/CreateOrganizationModal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Upload, Link as LinkIcon, X, Loader2, Check, AlertTriangle,
  UserPlus, Users, Mail, RefreshCw, Trash2, Crown, Shield, User,
  Send, ChevronDown, ChevronUp, Plug, CheckCircle2, XCircle, ExternalLink,
  Globe, Copy, Zap, CreditCard,
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
              <p className="text-xs text-gray-400 mt-0.5">Recommended: 256 × 256 px</p>
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

function TransferOwnershipModal({ member, orgName, onConfirm, onClose, transferring }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
            <Crown className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Transfer Ownership</h2>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400">
          You are about to transfer ownership of <span className="font-semibold text-gray-900 dark:text-gray-100">{orgName}</span> to{' '}
          <span className="font-semibold text-gray-900 dark:text-gray-100">{member.name || member.email}</span>.
        </p>

        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-1">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">What happens:</p>
          <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5 list-disc list-inside">
            <li>They become the new owner with full control</li>
            <li>You are demoted to Admin</li>
            <li>Only the new owner can reverse this</li>
          </ul>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            disabled={transferring}
            className="flex-1 px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={transferring}
            className="flex-1 px-4 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {transferring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
            Transfer Ownership
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Invite Modal ───────────────────────────────────────────────────────────────

function InviteModal({ orgId, onClose, onSent, userRole }) {
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
              {(userRole === 'owner' ? ['member', 'admin'] : ['member']).map((r) => (
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

// ── Custom Domain Tab ──────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm';

function StatusBadge({ status }) {
  const map = {
    setup_initiated:      { label: 'Not configured', cls: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' },
    email_sent:           { label: 'Email sent', cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
    pending_verification: { label: 'Pending verification', cls: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' },
    active:               { label: 'Active', cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
    verification_failed:  { label: 'Verification failed', cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
    ssl_error:            { label: 'SSL error', cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
    disconnected:         { label: 'Disconnected', cls: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' },
  };
  const { label, cls } = map[status] ?? map.setup_initiated;
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>;
}

function DnsRecord({ type, name, value }) {
  const [copied, setCopied] = useState('');
  function copy(text, key) {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(''), 2000); });
  }
  return (
    <div className="border dark:border-gray-700 rounded-lg p-3 font-mono text-xs space-y-1">
      <p className="text-gray-500 dark:text-gray-400 font-sans font-medium text-xs">{type} Record</p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-gray-500 dark:text-gray-400">Name:</span>
        <span className="flex-1 text-right truncate text-gray-900 dark:text-gray-100">{name}</span>
        <button onClick={() => copy(name, `name-${type}`)} className="shrink-0 text-blue-500 hover:text-blue-700">
          {copied === `name-${type}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-gray-500 dark:text-gray-400">Value:</span>
        <span className="flex-1 text-right truncate text-gray-900 dark:text-gray-100">{value}</span>
        <button onClick={() => copy(value, `val-${type}`)} className="shrink-0 text-blue-500 hover:text-blue-700">
          {copied === `val-${type}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

function CustomDomainTab({ orgId }) {
  const [isPaid, setIsPaid]         = useState(null); // null = loading
  const [domain, setDomain]         = useState(null);
  const [loading, setLoading]       = useState(true);
  const [subdomain, setSubdomain]   = useState('');
  const [dnsEmail, setDnsEmail]     = useState('');
  const [saving, setSaving]         = useState(false);
  const [sending, setSending]       = useState(false);
  const [verifying, setVerifying]   = useState(false);
  const [removing, setRemoving]     = useState(false);
  const [error, setError]           = useState('');
  const [verifyErrors, setVerifyErrors] = useState([]);
  const [primaryColor, setPrimaryColor]     = useState('#2563EB');
  const [secondaryColor, setSecondaryColor] = useState('#9333EA');
  const [bannerUrl, setBannerUrl]   = useState('');
  const [headerLinks, setHeaderLinks] = useState([]);
  const [savingBranding, setSavingBranding] = useState(false);

  function load() {
    setLoading(true);
    const sb = getBrowserClient();
    Promise.all([
      fetch(`/api/organizations/${orgId}/custom-domain`).then(r => r.json()).catch(() => null),
      sb.from('organizations').select('plan').eq('id', orgId).single(),
    ]).then(([domainData, { data: orgRow }]) => {
      const plan = orgRow?.plan ?? 'free';
      setIsPaid(plan !== 'free');
      if (domainData && !domainData.error) {
        setDomain(domainData);
        setSubdomain(domainData.subdomain ?? '');
        setDnsEmail(domainData.dns_admin_email ?? '');
        setPrimaryColor(domainData.primary_color ?? '#2563EB');
        setSecondaryColor(domainData.secondary_color ?? '#9333EA');
        setBannerUrl(domainData.banner_image_url ?? '');
        setHeaderLinks(domainData.header_links ?? []);
      }
    }).catch(() => { setIsPaid(false); }).finally(() => setLoading(false));
  }

  useEffect(() => { if (orgId) load(); }, [orgId]);

  async function handleSave() {
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/organizations/${orgId}/custom-domain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain, dns_admin_email: dnsEmail || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function handleSendEmail() {
    setSending(true); setError('');
    try {
      const res = await fetch(`/api/organizations/${orgId}/custom-domain/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dns_admin_email: dnsEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      load();
    } catch (e) { setError(e.message); }
    finally { setSending(false); }
  }

  async function handleVerify() {
    setVerifying(true); setError(''); setVerifyErrors([]);
    try {
      const res = await fetch(`/api/organizations/${orgId}/custom-domain/verify`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setVerifyErrors(data.errors ?? [data.error]); }
      load();
    } catch (e) { setError(e.message); }
    finally { setVerifying(false); }
  }

  async function handleRemove() {
    if (!confirm('Remove this custom domain? Event pages will revert to 123impact.org URLs.')) return;
    setRemoving(true);
    await fetch(`/api/organizations/${orgId}/custom-domain`, { method: 'DELETE' });
    setDomain(null); setSubdomain(''); setDnsEmail('');
    setRemoving(false);
    load();
  }

  async function saveBranding() {
    setSavingBranding(true);
    await fetch(`/api/organizations/${orgId}/custom-domain`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ primary_color: primaryColor, secondary_color: secondaryColor, banner_image_url: bannerUrl || null, header_links: headerLinks }),
    });
    // Purge Vercel edge cache for the branding endpoint
    if (domain?.subdomain) {
      await fetch(`/api/organizations/${orgId}/custom-domain/purge-cache`, { method: 'POST' }).catch(() => {});
    }
    setSavingBranding(false);
    load();
  }

  if (isPaid === null || loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>;

  if (!isPaid) {
    return (
      <div className="border dark:border-gray-700 rounded-xl p-8 text-center bg-white dark:bg-gray-900">
        <Globe className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Custom Domain</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">Custom domains are available on paid plans. Serve your event pages under your own subdomain.</p>
      </div>
    );
  }

  const status = domain?.status ?? 'setup_initiated';
  const isActive = status === 'active';

  const showDnsRecords = domain && ['setup_initiated', 'email_sent', 'pending_verification', 'verification_failed'].includes(status);

  return (
    <div className="space-y-4">
      {/* Status card */}
      <div className="border dark:border-gray-700 rounded-xl p-5 bg-white dark:bg-gray-900">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Globe className="w-4 h-4 text-gray-500" /> Custom Domain
          </h3>
          {domain && <StatusBadge status={status} />}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}
        {verifyErrors.length > 0 && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-700 dark:text-amber-400 space-y-1">
            {verifyErrors.map((e, i) => <p key={i}>{e}</p>)}
          </div>
        )}

        {/* Setup form — shown only when no domain saved yet */}
        {(!domain || status === 'disconnected') && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subdomain</label>
              <input type="text" value={subdomain} onChange={e => setSubdomain(e.target.value)}
                placeholder="events.yourorg.com" className={inputCls} />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Must include at least one dot (subdomain only, not root domain)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">DNS Admin Email <span className="text-gray-400 font-normal">(optional — who manages your DNS)</span></label>
              <input type="email" value={dnsEmail} onChange={e => setDnsEmail(e.target.value)}
                placeholder="dns-admin@yourorg.com" className={inputCls} />
            </div>
            <Button onClick={handleSave} disabled={saving || !subdomain.trim()}>
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : 'Save & Continue'}
            </Button>
          </div>
        )}

        {/* DNS records + send email */}
        {showDnsRecords && !isActive && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Add these DNS records to your domain registrar for <strong>{domain.subdomain}</strong>:
            </p>
            <DnsRecord type="CNAME" name={domain.subdomain} value="cname.vercel-dns.com" />
            <DnsRecord type="TXT" name={`_123impact-verify.${domain.subdomain}`} value={domain.verification_token} />
            <p className="text-xs text-gray-400 dark:text-gray-500">DNS changes can take up to 48 hours to propagate.</p>

            <div className="flex gap-2 flex-wrap">
              {dnsEmail && (
                <Button variant="outline" size="sm" onClick={handleSendEmail} disabled={sending}>
                  {sending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Sending…</> : 'Send Instructions to DNS Admin'}
                </Button>
              )}
              <Button size="sm" onClick={handleVerify} disabled={verifying}>
                {verifying ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Verifying…</> : 'Verify Now'}
              </Button>
            </div>
            {status === 'email_sent' && domain.dns_admin_email && (
              <p className="text-xs text-green-600 dark:text-green-400">
                Instructions sent to {domain.dns_admin_email}
              </p>
            )}
          </div>
        )}

        {/* Active state */}
        {isActive && (
          <div className="space-y-3">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">{domain.subdomain}</p>
              {domain.ssl_expires_at && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                  SSL expires {new Date(domain.ssl_expires_at).toLocaleDateString()}
                </p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={handleRemove} disabled={removing}
              className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20">
              {removing ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Removing…</> : 'Remove Custom Domain'}
            </Button>
          </div>
        )}
      </div>

      {/* Branding — only when active */}
      {isActive && (
        <div className="border dark:border-gray-700 rounded-xl p-5 bg-white dark:bg-gray-900 space-y-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Branding</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Primary Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border border-gray-300 dark:border-gray-600" />
                <input type="text" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                  className={inputCls + ' flex-1'} placeholder="#2563EB" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Secondary Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border border-gray-300 dark:border-gray-600" />
                <input type="text" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)}
                  className={inputCls + ' flex-1'} placeholder="#9333EA" />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Banner Image URL <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="url" value={bannerUrl} onChange={e => setBannerUrl(e.target.value)}
              className={inputCls} placeholder="https://yourorg.com/banner.jpg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Header Links <span className="text-gray-400 font-normal">(optional)</span></label>
            <div className="space-y-2">
              {headerLinks.map((link, i) => (
                <div key={i} className="flex gap-2">
                  <input type="text" value={link.label} onChange={e => setHeaderLinks(prev => prev.map((l, j) => j === i ? { ...l, label: e.target.value } : l))}
                    className={inputCls + ' flex-1'} placeholder="Label" />
                  <input type="url" value={link.url} onChange={e => setHeaderLinks(prev => prev.map((l, j) => j === i ? { ...l, url: e.target.value } : l))}
                    className={inputCls + ' flex-1'} placeholder="https://..." />
                  <button onClick={() => setHeaderLinks(prev => prev.filter((_, j) => j !== i))}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button onClick={() => setHeaderLinks(prev => [...prev, { label: '', url: '' }])}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                + Add link
              </button>
            </div>
          </div>
          <Button onClick={saveBranding} disabled={savingBranding}>
            {savingBranding ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : 'Save Branding'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Billing Tab ────────────────────────────────────────────────────────────────

function BillingTab({ orgId }) {
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(null); // 'month' | 'year'
  const searchParams = useSearchParams();
  const router = useRouter();
  const justUpgraded = searchParams.get('success') === '1';

  useEffect(() => {
    if (justUpgraded) {
      const url = new URL(window.location.href);
      url.searchParams.delete('success');
      router.replace(url.pathname + (url.search || ''));
    }
  }, []);

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/billing/status?orgId=${orgId}`)
      .then((r) => r.json())
      .then((d) => { setStatus(d); setLoading(false); })
      .catch(() => { setError('Failed to load billing info'); setLoading(false); });
  }, [orgId]);

  async function openPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else { alert(data.error ?? 'Could not open billing portal'); setPortalLoading(false); }
    } catch { alert('Network error'); setPortalLoading(false); }
  }

  async function startCheckout(interval) {
    setCheckoutLoading(interval);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval, orgId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else { alert(data.error ?? 'Could not start checkout'); setCheckoutLoading(null); }
    } catch { alert('Network error'); setCheckoutLoading(null); }
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  if (error) return <div className="p-4 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-sm">{error}</div>;

  const isPro = status?.plan === 'pro';
  const periodEnd = status?.current_period_end ? new Date(status.current_period_end).toLocaleDateString() : null;
  const graceEnd  = status?.grace_period_end  ? new Date(status.grace_period_end).toLocaleDateString()  : null;
  const eventPct  = Math.min(100, Math.round(((status?.events_this_year ?? 0) / 35) * 100));

  return (
    <div className="space-y-4">
      {justUpgraded && (
        <div className="p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg flex items-center gap-2 text-green-700 dark:text-green-400">
          <Check className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm font-medium">Your plan has been upgraded to Pro. Welcome!</span>
        </div>
      )}

      {status?.is_in_grace_period && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-amber-700 dark:text-amber-400">
          <p className="font-semibold mb-1">Pro access ending {graceEnd}</p>
          <p className="mb-3">Your subscription was canceled or payment failed. Re-subscribe to keep Pro features.</p>
          <div className="flex gap-2">
            <button onClick={() => startCheckout('month')} disabled={checkoutLoading !== null}
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-lg font-medium disabled:opacity-60">
              {checkoutLoading === 'month' ? 'Redirecting…' : 'Re-subscribe Monthly ($20/mo)'}
            </button>
            <button onClick={() => startCheckout('year')} disabled={checkoutLoading !== null}
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-lg font-medium disabled:opacity-60">
              {checkoutLoading === 'year' ? 'Redirecting…' : 'Annual ($192/yr)'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Current Plan</h2>
            <div className="flex items-center gap-2 mt-1">
              {isPro ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                  <Zap className="w-3 h-3" /> Pro
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                  Free
                </span>
              )}
              {isPro && status?.billing_interval && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  · {status.billing_interval === 'month' ? 'Monthly' : 'Annual'}
                  {periodEnd && ` · renews ${periodEnd}`}
                </span>
              )}
            </div>
          </div>
          {isPro && status?.has_stripe_customer && !status?.is_in_grace_period && (
            <button onClick={openPortal} disabled={portalLoading}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60">
              <CreditCard className="w-4 h-4" />
              {portalLoading ? 'Opening…' : 'Manage Billing'}
            </button>
          )}
        </div>

        {!isPro && (
          <>
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-600 dark:text-gray-400">Events this year</span>
                <span className="font-medium text-gray-900 dark:text-white">{status?.events_this_year ?? 0} / 35</span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${eventPct >= 80 ? 'bg-amber-500' : 'bg-blue-500'}`}
                  style={{ width: `${eventPct}%` }}
                />
              </div>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-3">Upgrade to Pro for unlimited events and more</p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => startCheckout('month')} disabled={checkoutLoading !== null}
                  className="flex flex-col items-center border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:border-blue-500 dark:hover:border-blue-400 transition-colors disabled:opacity-60">
                  <span className="text-xs text-gray-500 dark:text-gray-400 mb-1">Monthly</span>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">$20</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">per month</span>
                  {checkoutLoading === 'month' && <span className="text-xs text-blue-500 mt-2">Redirecting…</span>}
                </button>
                <button onClick={() => startCheckout('year')} disabled={checkoutLoading !== null}
                  className="flex flex-col items-center border-2 border-blue-500 dark:border-blue-400 rounded-xl p-4 hover:border-blue-600 transition-colors disabled:opacity-60 relative">
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap">
                    Save 20%
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 mb-1">Annual</span>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">$16</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">per month</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">$192/yr</span>
                  {checkoutLoading === 'year' && <span className="text-xs text-blue-500 mt-2">Redirecting…</span>}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Integrations Tab ──────────────────────────────────────────────────────────

function ImportModal({ orgId, platform, onClose, onImported }) {
  const [events, setEvents]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [selected, setSelected]   = useState(new Set());
  const [syncNew, setSyncNew]     = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetch(`/api/organizations/${orgId}/platform-events?platform=${platform}`)
      .then(r => r.json())
      .then(data => { if (data.error) throw new Error(data.error); setEvents(data.events ?? []); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [orgId, platform]);

  async function handleImport() {
    const ids = [...selected];
    if (!ids.length) return;
    setImporting(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, external_ids: ids, sync_new_events: syncNew }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onImported(data.imported, data.warning);
      onClose();
    } catch (e) {
      setError(e.message);
      setImporting(false);
    }
  }

  const platformLabel = platform === 'luma' ? 'Luma' : 'Eventbrite';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-5 border-b dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Import from {platformLabel}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {!loading && !error && events.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No events found on {platformLabel}.</p>
          )}
          {!loading && !error && events.length > 0 && (
            <div className="space-y-2">
              {events.map(e => (
                <label key={e.external_id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  e.already_imported ? 'opacity-50 cursor-not-allowed border-gray-200 dark:border-gray-700' :
                  selected.has(e.external_id) ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' :
                  'border-gray-200 dark:border-gray-700 hover:border-blue-300'
                }`}>
                  <input type="checkbox" className="mt-0.5 rounded"
                    disabled={e.already_imported}
                    checked={e.already_imported || selected.has(e.external_id)}
                    onChange={ev => {
                      const next = new Set(selected);
                      ev.target.checked ? next.add(e.external_id) : next.delete(e.external_id);
                      setSelected(next);
                    }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{e.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{e.date}{e.end_date ? ` – ${e.end_date}` : ''} {e.location ? `· ${e.location}` : ''}</p>
                  </div>
                  {e.already_imported && <span className="text-xs text-green-600 dark:text-green-400 shrink-0">Imported</span>}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 border-t dark:border-gray-700 space-y-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none text-gray-700 dark:text-gray-300">
            <input type="checkbox" className="rounded" checked={syncNew} onChange={e => setSyncNew(e.target.checked)} />
            Automatically import new events added to this account (nightly)
          </label>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleImport} disabled={importing || selected.size === 0} className="flex-1">
              {importing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing…</> : `Import ${selected.size > 0 ? `(${selected.size})` : ''}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IntegrationsTab({ orgId }) {
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState({ luma: null, eventbrite: null });
  const [loading, setLoading]         = useState(true);
  const [lumaKey, setLumaKey]         = useState('');
  const [savingLuma, setSavingLuma]   = useState(false);
  const [lumaError, setLumaError]     = useState('');
  const [lumaSuccess, setLumaSuccess] = useState(false);
  const [disconnecting, setDisconnecting] = useState('');
  const [importModal, setImportModal] = useState(null);
  const [toast, setToast]             = useState('');
  const [oauthError, setOauthError]   = useState('');

  const OAUTH_ERRORS = {
    eventbrite_already_connected: 'This Eventbrite account is already connected to another organization.',
    eventbrite_denied:  'Eventbrite authorization was cancelled.',
    eventbrite_failed:  'Eventbrite connection failed. Please try again.',
    invalid_state:      'Invalid OAuth state. Please try again.',
  };

  useEffect(() => {
    const err = searchParams.get('error');
    if (err && OAUTH_ERRORS[err]) setOauthError(OAUTH_ERRORS[err]);
  }, [searchParams]);

  function loadConnections() {
    setLoading(true);
    fetch(`/api/organizations/${orgId}/connections`)
      .then(r => r.json())
      .then(data => setConnections(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { if (orgId) loadConnections(); }, [orgId]);

  async function connectLuma() {
    if (!lumaKey.trim()) return;
    setSavingLuma(true); setLumaError(''); setLumaSuccess(false);
    try {
      const res = await fetch(`/api/organizations/${orgId}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'luma', api_key: lumaKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLumaSuccess(true); setLumaKey(''); loadConnections();
    } catch (e) { setLumaError(e.message); }
    finally { setSavingLuma(false); }
  }

  async function disconnect(platform) {
    if (!confirm(`Disconnect ${platform === 'luma' ? 'Luma' : 'Eventbrite'}? Sync will stop but your imported events will not be affected.`)) return;
    setDisconnecting(platform);
    await fetch(`/api/organizations/${orgId}/connections`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform }),
    });
    setDisconnecting(''); loadConnections();
  }

  async function toggleSync(platform, value) {
    await fetch(`/api/organizations/${orgId}/connections`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, sync_new_events: value }),
    });
    loadConnections();
  }

  function handleImported(n, warning) {
    const base = n > 0 ? `${n} event${n !== 1 ? 's' : ''} imported successfully` : '';
    setToast(warning ? (base ? `${base}. ${warning}` : warning) : base);
    setTimeout(() => setToast(''), 8000);
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

  const platforms = [
    {
      key: 'luma',
      label: 'Luma',
      description: 'Import events from your Luma calendar using your API key.',
      docsHint: 'Find your API key in Luma → Settings → API',
    },
    {
      key: 'eventbrite',
      label: 'Eventbrite',
      description: 'Import events from your Eventbrite organization via OAuth.',
    },
  ];

  return (
    <>
      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 z-50">
          <CheckCircle2 className="w-4 h-4 text-green-400" /> {toast}
        </div>
      )}
      {importModal && (
        <ImportModal orgId={orgId} platform={importModal} onClose={() => setImportModal(null)} onImported={handleImported} />
      )}

      {oauthError && (
        <div className="flex items-start gap-2 mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{oauthError}</span>
          <button onClick={() => setOauthError('')} className="ml-auto text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}
      <div className="space-y-4">
        {platforms.map(({ key, label, description, docsHint }) => {
          const conn = connections[key];
          return (
            <div key={key} className="border dark:border-gray-700 rounded-xl p-5 bg-white dark:bg-gray-900">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Plug className="w-4 h-4 text-gray-500" />
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{label}</h3>
                    {conn ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">Connected</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 font-medium">Not connected</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
                  {conn && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      Connected {new Date(conn.connected_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {conn && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setImportModal(key)}>Import Events</Button>
                      <Button size="sm" variant="outline" onClick={() => disconnect(key)} disabled={disconnecting === key} className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20">
                        {disconnecting === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Disconnect'}
                      </Button>
                    </>
                  )}
                  {!conn && key === 'eventbrite' && (
                    <Button size="sm" onClick={() => window.location.href = `/api/auth/integrations/eventbrite?org_id=${orgId}`}>
                      Connect Eventbrite
                    </Button>
                  )}
                </div>
              </div>

              {!conn && key === 'luma' && (
                <div className="mt-4 space-y-2">
                  {docsHint && <p className="text-xs text-gray-400 dark:text-gray-500">{docsHint}</p>}
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={lumaKey}
                      onChange={e => setLumaKey(e.target.value)}
                      placeholder="luma_api_..."
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                    />
                    <Button size="sm" onClick={connectLuma} disabled={savingLuma || !lumaKey.trim()}>
                      {savingLuma ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect'}
                    </Button>
                  </div>
                  {lumaError && <p className="text-xs text-red-600 dark:text-red-400">{lumaError}</p>}
                  {lumaSuccess && <p className="text-xs text-green-600 dark:text-green-400">Luma connected successfully</p>}
                </div>
              )}

              {conn && (
                <div className="mt-4 pt-4 border-t dark:border-gray-700">
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none text-gray-700 dark:text-gray-300">
                    <input type="checkbox" className="rounded"
                      checked={conn.sync_new_events}
                      onChange={e => toggleSync(key, e.target.checked)} />
                    Automatically import new events added to this account (nightly)
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
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
  const [changingRoleId, setChangingRoleId] = useState(null);
  const [transferTarget, setTransferTarget] = useState(null);
  const [transferring, setTransferring]     = useState(false);

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

  async function confirmTransfer() {
    if (!transferTarget) return;
    setTransferring(true);
    const res = await fetch(`/api/organizations/${org.id}/members`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: transferTarget.user_id, role: 'owner' }),
    });
    setTransferring(false);
    if (res.ok) {
      setTransferTarget(null);
      await load();
    } else {
      const data = await res.json();
      alert(data.error ?? 'Failed to transfer ownership');
    }
  }

  async function updateMemberRole(userId, newRole) {
    setChangingRoleId(userId);
    const res = await fetch(`/api/organizations/${org.id}/members`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, role: newRole }),
    });
    if (res.ok) {
      setMembers((prev) => prev.map((m) => m.user_id === userId ? { ...m, role: newRole } : m));
    } else {
      const data = await res.json();
      alert(data.error ?? 'Failed to update role');
    }
    setChangingRoleId(null);
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
            const canEditRole = isOwner && !isCurrentUser && m.role !== 'owner';
            const canRemove   = canEditRole;
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
                {canEditRole ? (
                  changingRoleId === m.user_id ? (
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  ) : (
                    <select
                      value={m.role}
                      onChange={(e) => updateMemberRole(m.user_id, e.target.value)}
                      className="text-xs border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 cursor-pointer hover:border-gray-400 transition-colors"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  )
                ) : (
                  <RoleBadge role={m.role} />
                )}
                {canEditRole && (
                  <button
                    onClick={() => setTransferTarget(m)}
                    title="Transfer ownership to this member"
                    className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-colors"
                  >
                    <Crown className="w-4 h-4" />
                  </button>
                )}
                {canRemove && (
                  <button
                    onClick={() => removeMember(m.user_id, m.name || m.email)}
                    disabled={removingId === m.user_id}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
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
        <InviteModal orgId={org.id} onClose={() => setShowInviteModal(false)} onSent={load} userRole={userRole ?? currentOrganization.role} />
      )}

      {transferTarget && (
        <TransferOwnershipModal
          member={transferTarget}
          orgName={org.name}
          onConfirm={confirmTransfer}
          onClose={() => setTransferTarget(null)}
          transferring={transferring}
        />
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

function OrganizationsPageContent() {
  const { currentOrganization, organizations, loading: orgLoading, refreshOrganizations, userRole } = useOrganization();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab]     = useState('settings');
  const [showCreateModal, setShowCreateModal] = useState(false);
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
    const t = searchParams.get('tab');
    if (t === 'members' || t === 'integrations' || t === 'custom-domain' || t === 'billing') setActiveTab(t);
  }, [searchParams]);

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
    const wantsBilling = searchParams.get('tab') === 'billing';
    const hasNoOrgs = !orgLoading && organizations.length === 0;
    return (
      <>
        <AdminNavigation />
        <div className="container mx-auto px-4 py-8">
          <Card className="p-8 text-center max-w-md mx-auto">
            <Zap className="w-10 h-10 text-blue-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {wantsBilling ? 'Create an organization to get started' : 'No organization selected.'}
            </h2>
            {wantsBilling && (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  You'll need an organization before upgrading to Pro.
                </p>
                <Button onClick={() => setShowCreateModal(true)} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:opacity-90">
                  Create Organization
                </Button>
              </>
            )}
          </Card>
        </div>
        {showCreateModal && (
          <CreateOrganizationModal
            onClose={() => setShowCreateModal(false)}
            onSuccess={async (newOrg) => {
              setShowCreateModal(false);
              await refreshOrganizations();
              router.push('/admin/organizations?tab=billing');
            }}
          />
        )}
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
          {['settings', 'members', 'integrations', 'custom-domain', 'billing'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}>
              {tab === 'settings' ? 'Settings'
                : tab === 'members' ? 'Members'
                : tab === 'integrations' ? 'Integrations'
                : tab === 'custom-domain' ? 'Custom Domain'
                : 'Billing'}
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

        {/* Integrations tab */}
        {activeTab === 'integrations' && currentOrganization && (
          <IntegrationsTab orgId={currentOrganization.id} />
        )}

        {/* Custom Domain tab */}
        {activeTab === 'custom-domain' && currentOrganization && (
          <CustomDomainTab orgId={currentOrganization.id} />
        )}

        {/* Billing tab */}
        {activeTab === 'billing' && currentOrganization && (
          <BillingTab orgId={currentOrganization.id} />
        )}
      </div>
    </>
  );
}

export default function OrganizationsPage() {
  return (
    <Suspense>
      <OrganizationsPageContent />
    </Suspense>
  );
}
