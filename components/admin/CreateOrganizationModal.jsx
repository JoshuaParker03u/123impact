'use client';

import { useState, useRef } from 'react';
import { X, Upload, Link as LinkIcon, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024;

// ── Logo uploader (upload file OR paste URL) ─────────────────────────────────

function LogoUploader({ logoTab, setLogoTab, logoFile, setLogoFile, logoUrl, setLogoUrl, logoPreview, setLogoPreview }) {
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState('');

  function handleFile(file) {
    setFileError('');
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError('Invalid type. Use JPG, PNG, SVG, or WebP.');
      return;
    }
    if (file.size > MAX_SIZE) {
      setFileError('File too large. Max 5 MB.');
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }

  function clearFile() {
    setLogoFile(null);
    setLogoPreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function clearUrl() {
    setLogoUrl('');
    setLogoPreview('');
  }

  function handleUrlChange(val) {
    setLogoUrl(val);
    setLogoPreview(val);
  }

  return (
    <div>
      {/* Tab switcher */}
      <div className="flex gap-1 mb-3 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        {['upload', 'url'].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => { setLogoTab(tab); clearFile(); clearUrl(); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              logoTab === tab
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            {tab === 'upload' ? <Upload className="w-3.5 h-3.5" /> : <LinkIcon className="w-3.5 h-3.5" />}
            {tab === 'upload' ? 'Upload File' : 'Image URL'}
          </button>
        ))}
      </div>

      {logoTab === 'upload' ? (
        <div>
          {logoFile ? (
            <div className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
              <img src={logoPreview} alt="Preview" className="w-12 h-12 rounded-lg object-cover" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{logoFile.name}</p>
                <p className="text-xs text-gray-500">{(logoFile.size / 1024).toFixed(0)} KB</p>
              </div>
              <button type="button" onClick={clearFile} className="text-gray-400 hover:text-red-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
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
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">JPG, PNG, SVG, WebP — max 5 MB</p>
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
              value={logoUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://example.com/logo.png"
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
            />
            {logoUrl && (
              <button type="button" onClick={clearUrl} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {logoUrl && (
            <div className="mt-2 flex items-center gap-2">
              <img
                src={logoUrl}
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

// ── Main modal ───────────────────────────────────────────────────────────────

export default function CreateOrganizationModal({ onClose, onSuccess }) {
  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [website, setWebsite]         = useState('');
  const [logoTab, setLogoTab]         = useState('upload');
  const [logoFile, setLogoFile]       = useState(null);
  const [logoUrl, setLogoUrl]         = useState('');
  const [logoPreview, setLogoPreview] = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState('');
  const [nameError, setNameError]     = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setNameError('');
    setError('');

    if (!name.trim()) {
      setNameError('Organization name is required');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      if (description.trim())  formData.append('description',   description.trim());
      if (contactEmail.trim()) formData.append('contact_email', contactEmail.trim());
      if (contactPhone.trim()) formData.append('contact_phone', contactPhone.trim());
      if (website.trim())      formData.append('website',       website.trim());

      if (logoTab === 'upload' && logoFile) {
        formData.append('logo_file', logoFile);
      } else if (logoTab === 'url' && logoUrl.trim()) {
        formData.append('logo_url', logoUrl.trim());
      }

      const response = await fetch('/api/organizations', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error ?? 'Failed to create organization');
        return;
      }

      onSuccess(result.data);
    } catch (err) {
      setError(err.message ?? 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b dark:border-gray-800">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Create Organization</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Global error */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Organization Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); if (nameError) setNameError(''); }}
              disabled={submitting}
              placeholder="e.g., Riverside Community Volunteers"
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 ${
                nameError ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              }`}
            />
            {nameError && <p className="text-red-600 text-sm mt-1">{nameError}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              rows={3}
              placeholder="Tell volunteers about your organization..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-none"
            />
          </div>

          {/* Logo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Logo <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <LogoUploader
              logoTab={logoTab} setLogoTab={setLogoTab}
              logoFile={logoFile} setLogoFile={setLogoFile}
              logoUrl={logoUrl}   setLogoUrl={setLogoUrl}
              logoPreview={logoPreview} setLogoPreview={setLogoPreview}
            />
          </div>

          {/* Contact info row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Contact Email <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
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
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
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
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              disabled={submitting}
              placeholder="https://yourorg.com"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-gradient-to-br from-blue-600 to-purple-600 hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Organization'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              className="px-6 border-gray-300 dark:border-gray-600"
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
