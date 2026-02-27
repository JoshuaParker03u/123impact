'use client';

import { useState, useEffect, useRef } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';
import AdminNavigation from '@/components/admin/AdminNavigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { Upload, Link as LinkIcon, X, Loader2, Check, AlertTriangle } from 'lucide-react';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024;

// ── Logo editor ───────────────────────────────────────────────────────────────

function LogoEditor({ currentLogoUrl, onChange }) {
  const [tab, setTab]           = useState('upload');
  const [file, setFile]         = useState(null);
  const [filePreview, setFilePreview] = useState('');
  const [urlValue, setUrlValue] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef(null);

  function handleFile(f) {
    setFileError('');
    if (!f) return;
    if (!ALLOWED_TYPES.includes(f.type)) {
      setFileError('Invalid type. Use JPG, PNG, SVG, or WebP.');
      return;
    }
    if (f.size > MAX_SIZE) {
      setFileError('File too large. Max 5 MB.');
      return;
    }
    setFile(f);
    const preview = URL.createObjectURL(f);
    setFilePreview(preview);
    onChange({ type: 'file', file: f });
  }

  function clearFile() {
    setFile(null);
    setFilePreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    onChange({ type: 'none' });
  }

  function handleUrlChange(val) {
    setUrlValue(val);
    onChange({ type: 'url', url: val });
  }

  function clearUrl() {
    setUrlValue('');
    onChange({ type: 'none' });
  }

  function switchTab(t) {
    setTab(t);
    clearFile();
    setUrlValue('');
    onChange({ type: 'none' });
  }

  return (
    <div>
      {/* Current logo */}
      {currentLogoUrl && !file && !urlValue && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <img
            src={currentLogoUrl}
            alt="Current logo"
            className="w-12 h-12 rounded-lg object-cover border border-gray-200 dark:border-gray-700"
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Current logo</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Upload a new one to replace it</p>
          </div>
          <button
            type="button"
            onClick={() => onChange({ type: 'clear' })}
            className="text-gray-400 hover:text-red-500 transition-colors text-xs"
          >
            Remove
          </button>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 mb-3 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        {['upload', 'url'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => switchTab(t)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
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
              <button type="button" onClick={clearFile} className="text-gray-400 hover:text-red-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
              }`}
            >
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Drag & drop or <span className="text-blue-600 dark:text-blue-400 font-medium">browse</span>
              </p>
              <p className="text-xs text-gray-500 mt-1">JPG, PNG, SVG, WebP — max 5 MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          )}
          {fileError && <p className="text-red-600 text-sm mt-1">{fileError}</p>}
        </div>
      ) : (
        <div>
          <div className="flex gap-2">
            <input
              type="url"
              value={urlValue}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://example.com/logo.png"
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
            />
            {urlValue && (
              <button type="button" onClick={clearUrl} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {urlValue && (
            <div className="mt-2 flex items-center gap-2">
              <img
                src={urlValue}
                alt="Preview"
                className="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-gray-700"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">Preview</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OrganizationsSettingsPage() {
  const { currentOrganization, loading: orgLoading, refreshOrganizations } = useOrganization();
  const router = useRouter();

  const [org, setOrg]             = useState(null);
  const [fetching, setFetching]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState('');

  // Delete state
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting]                   = useState(false);
  const [deleteError, setDeleteError]             = useState('');

  // Logo change state: { type: 'none' | 'file' | 'url' | 'clear', file?, url? }
  const [logoChange, setLogoChange] = useState({ type: 'none' });

  const [form, setForm] = useState({
    name: '',
    description: '',
    contact_email: '',
    contact_phone: '',
    website: '',
    status: 'active',
  });

  // Fetch full org details when current org changes
  useEffect(() => {
    if (!currentOrganization) return;
    setFetching(true);
    setError('');
    setLogoChange({ type: 'none' });

    fetch(`/api/organizations/${currentOrganization.id}`)
      .then((r) => r.json())
      .then(({ data, error: e }) => {
        if (e || !data) { setError(e ?? 'Failed to load organization'); return; }
        setOrg(data);
        setForm({
          name:          data.name          ?? '',
          description:   data.description   ?? '',
          contact_email: data.contact_email ?? '',
          contact_phone: data.contact_phone ?? '',
          website:       data.website       ?? '',
          status:        data.status        ?? 'active',
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setFetching(false));
  }, [currentOrganization?.id]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!org) return;

    setSubmitting(true);
    setError('');
    setSaved(false);

    try {
      const fd = new FormData();
      fd.append('name',          form.name.trim());
      fd.append('description',   form.description.trim());
      fd.append('contact_email', form.contact_email.trim());
      fd.append('contact_phone', form.contact_phone.trim());
      fd.append('website',       form.website.trim());
      fd.append('status',        form.status);

      if (logoChange.type === 'file')  fd.append('logo_file', logoChange.file);
      else if (logoChange.type === 'url')   fd.append('logo_url', logoChange.url);
      else if (logoChange.type === 'clear') fd.append('clear_logo', 'true');

      const res = await fetch(`/api/organizations/${org.id}`, { method: 'PATCH', body: fd });
      const result = await res.json();

      if (!res.ok) { setError(result.error ?? 'Failed to save changes'); return; }

      setOrg(result.data);
      setLogoChange({ type: 'none' });
      setSaved(true);
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
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/organizations/${org.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const result = await res.json();
        setDeleteError(result.error ?? 'Failed to delete organization');
        return;
      }
      await refreshOrganizations();
      router.push('/dashboard');
    } catch (err) {
      setDeleteError(err.message ?? 'Unexpected error');
    } finally {
      setDeleting(false);
    }
  }

  // ── Loading states ──────────────────────────────────────────────────────────

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

  // ── Main render ─────────────────────────────────────────────────────────────

  return (
    <>
      <AdminNavigation />
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Organization Settings</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{currentOrganization.name}</p>
        </div>

        {fetching ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <Card className="p-6">
            {error && (
              <div className="mb-5 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Organization Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  disabled={submitting}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Description <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  disabled={submitting}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-none"
                />
              </div>

              {/* Logo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Logo <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <LogoEditor
                  currentLogoUrl={logoChange.type === 'clear' ? null : org?.logo_url}
                  onChange={setLogoChange}
                />
              </div>

              {/* Contact info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Contact Email <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="email"
                    value={form.contact_email}
                    onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                    disabled={submitting}
                    placeholder="contact@org.com"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Contact Phone <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={form.contact_phone}
                    onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                    disabled={submitting}
                    placeholder="(555) 123-4567"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Website */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Website <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="url"
                  value={form.website}
                  onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                  disabled={submitting}
                  placeholder="https://yourorg.com"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  disabled={submitting}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {/* Save button */}
              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-gradient-to-br from-blue-600 to-purple-600 hover:opacity-90 disabled:opacity-50 px-8"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
                {saved && (
                  <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 font-medium">
                    <Check className="w-4 h-4" /> Saved
                  </span>
                )}
              </div>
            </form>
          </Card>
        )}

        {/* Danger Zone — owners only */}
        {!fetching && org?.role === 'owner' && (
          <Card className="mt-6 p-6 border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              <h2 className="text-lg font-semibold text-red-700 dark:text-red-400">Danger Zone</h2>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Permanently deletes this organization along with all its events, shifts, and volunteer
              registrations. This cannot be undone.
            </p>

            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">
                {deleteError}
              </div>
            )}

            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Type <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{org.name}</span> to confirm
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                disabled={deleting}
                placeholder={org.name}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-red-500 disabled:opacity-50 text-sm"
              />
              <Button
                type="button"
                onClick={handleDelete}
                disabled={deleting || deleteConfirmName !== org.name}
                className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 shrink-0"
              >
                {deleting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Deleting…</> : 'Delete Organization'}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
