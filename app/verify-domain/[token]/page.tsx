'use client';

import { useState, useEffect } from 'react';
import { use } from 'react';
import Link from 'next/link';
import { Heart, CheckCircle, AlertCircle, Loader2, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DomainInfo {
  organization_id: string;
  org_name: string;
  subdomain: string;
  cname_name: string;
  cname_value: string;
  txt_name: string;
  txt_value: string;
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div className="flex items-center gap-2 font-mono text-xs bg-gray-100 dark:bg-gray-800 rounded px-2 py-1.5">
      <span className="flex-1 truncate text-gray-800 dark:text-gray-200">{value}</span>
      <button onClick={copy} className="text-gray-400 hover:text-blue-500 shrink-0">
        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

export default function VerifyDomainPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [info, setInfo]         = useState<DomainInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus]     = useState<'idle' | 'verifying' | 'success' | 'failed'>('idle');
  const [verifyErrors, setVerifyErrors] = useState<string[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch(`/api/verify-domain/${token}`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setInfo(data);
      })
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleVerify() {
    if (!info) return;
    setStatus('verifying');
    setVerifyErrors([]);
    try {
      const res = await fetch(`/api/organizations/${info.organization_id}/custom-domain/verify`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setStatus('success');
      } else {
        setVerifyErrors(data.errors ?? ['Verification failed']);
        setStatus('failed');
      }
    } catch {
      setVerifyErrors(['Network error — please try again']);
      setStatus('failed');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="border-b bg-white dark:bg-gray-900 dark:border-gray-800">
        <div className="container mx-auto px-4 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
              <Heart className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              123impact
            </h1>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-16 max-w-lg">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border dark:border-gray-800 shadow-sm p-8">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
          ) : loadError ? (
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Link Unavailable</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{loadError}</p>
            </div>
          ) : status === 'success' ? (
            <div className="text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Domain Verified!</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <strong>{info?.subdomain}</strong> is now active. Event pages are live under this subdomain.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">DNS Verification</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                <strong>{info?.org_name}</strong> is setting up event pages at <strong>{info?.subdomain}</strong>.
                Please confirm you've added the following DNS records:
              </p>

              <div className="space-y-4 mb-6">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">CNAME Record</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Name</p>
                  <CopyField value={info?.cname_name ?? ''} />
                  <p className="text-xs text-gray-500 dark:text-gray-400">Value</p>
                  <CopyField value={info?.cname_value ?? ''} />
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">TXT Record</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Name</p>
                  <CopyField value={info?.txt_name ?? ''} />
                  <p className="text-xs text-gray-500 dark:text-gray-400">Value</p>
                  <CopyField value={info?.txt_value ?? ''} />
                </div>
              </div>

              <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                DNS propagation can take up to 48 hours. Click Verify once the records are in place.
              </p>

              {verifyErrors.length > 0 && (
                <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-700 dark:text-amber-400 space-y-1">
                  {verifyErrors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}

              <Button onClick={handleVerify} disabled={status === 'verifying'} className="w-full">
                {status === 'verifying'
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying DNS Records…</>
                  : 'Verify DNS Records'
                }
              </Button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
