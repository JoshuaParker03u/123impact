'use client';

import { useState } from 'react';
import { Zap, Check } from 'lucide-react';
import FloatingWindow from '@/components/FloatingWindow';
import CheckoutModal from './CheckoutModal';

interface Props {
  feature: string;
  orgId: string;
  onClose: () => void;
}

export default function UpgradeModal({ feature, orgId, onClose }: Props) {
  const [checkoutInterval, setCheckoutInterval] = useState<'month' | 'year' | null>(null);

  if (checkoutInterval) {
    return (
      <CheckoutModal
        orgId={orgId}
        interval={checkoutInterval}
        onClose={() => setCheckoutInterval(null)}
      />
    );
  }

  return (
    <FloatingWindow
      title={<><Zap className="w-5 h-5 text-yellow-500" /> Upgrade to Pro</>}
      onClose={onClose}
      maxWidthClassName="max-w-md"
    >
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            <span className="font-medium text-gray-900 dark:text-white">{feature}</span> is a Pro feature.
            Upgrade to unlock it along with unlimited events, custom domains, and more.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-6">
            {/* Monthly */}
            <button
              onClick={() => setCheckoutInterval('month')}
              className="flex flex-col items-center border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:border-blue-500 dark:hover:border-blue-400 transition-colors disabled:opacity-60"
            >
              <span className="text-xs text-gray-500 dark:text-gray-400 mb-1">Monthly</span>
              <span className="text-2xl font-bold text-gray-900 dark:text-white">$20</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">per month</span>
            </button>

            {/* Annual */}
            <button
              onClick={() => setCheckoutInterval('year')}
              className="flex flex-col items-center border-2 border-blue-500 dark:border-blue-400 rounded-xl p-4 hover:border-blue-600 transition-colors disabled:opacity-60 relative"
            >
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs font-medium px-2 py-0.5 rounded-full">
                Save 20%
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 mb-1">Annual</span>
              <span className="text-2xl font-bold text-gray-900 dark:text-white">$16</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">per month</span>
              <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">$192 billed yearly</span>
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
    </FloatingWindow>
  );
}
