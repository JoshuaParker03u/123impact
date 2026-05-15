'use client';

import { useState } from 'react';
import { X, Zap, Check } from 'lucide-react';

interface Props {
  feature: string;
  orgId: string;
  onClose: () => void;
}

export default function UpgradeModal({ feature, orgId, onClose }: Props) {
  const [loading, setLoading] = useState<'month' | 'year' | null>(null);

  async function startCheckout(interval: 'month' | 'year') {
    setLoading(interval);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval, orgId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error ?? 'Something went wrong');
        setLoading(null);
      }
    } catch {
      alert('Network error, please try again');
      setLoading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Upgrade to Pro</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            <span className="font-medium text-gray-900 dark:text-white">{feature}</span> is a Pro feature.
            Upgrade to unlock it along with unlimited events, custom domains, and more.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-6">
            {/* Monthly */}
            <button
              onClick={() => startCheckout('month')}
              disabled={loading !== null}
              className="flex flex-col items-center border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:border-blue-500 dark:hover:border-blue-400 transition-colors disabled:opacity-60"
            >
              <span className="text-xs text-gray-500 dark:text-gray-400 mb-1">Monthly</span>
              <span className="text-2xl font-bold text-gray-900 dark:text-white">$20</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">per month</span>
              {loading === 'month' && (
                <span className="text-xs text-blue-500 mt-2">Redirecting…</span>
              )}
            </button>

            {/* Annual */}
            <button
              onClick={() => startCheckout('year')}
              disabled={loading !== null}
              className="flex flex-col items-center border-2 border-blue-500 dark:border-blue-400 rounded-xl p-4 hover:border-blue-600 transition-colors disabled:opacity-60 relative"
            >
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs font-medium px-2 py-0.5 rounded-full">
                Save 20%
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 mb-1">Annual</span>
              <span className="text-2xl font-bold text-gray-900 dark:text-white">$16</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">per month</span>
              <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">$192 billed yearly</span>
              {loading === 'year' && (
                <span className="text-xs text-blue-500 mt-2">Redirecting…</span>
              )}
            </button>
          </div>

          <ul className="space-y-1.5 mb-6">
            {['Unlimited events', 'Custom domain', 'Event admin roles', 'Priority support'].map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>

          <button
            onClick={onClose}
            className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 py-2"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
