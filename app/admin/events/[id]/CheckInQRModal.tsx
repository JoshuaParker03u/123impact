'use client';

import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { X, Download, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface CheckInQRModalProps {
  registrantName: string;
  checkInUrl: string;
  onClose: () => void;
}

// Renders a printable/scannable QR code for one registrant's personal
// check-in link. Kept separate from the marketing QR tab (QRCodesTab) —
// that one tracks signup-source attribution for a whole event; this one is
// a single-use, per-person link staff scan at the door.
export default function CheckInQRModal({ registrantName, checkInUrl, onClose }: CheckInQRModalProps) {
  const [copied, setCopied] = useState(false);
  const fileSafeName = registrantName.replace(/\s+/g, '-').toLowerCase();

  function downloadPng() {
    const canvas = document.getElementById('checkin-qr-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `checkin-qr-${fileSafeName}.png`;
    a.click();
  }

  async function copyLink() {
    await navigator.clipboard.writeText(checkInUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">{registrantName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="hidden">
          <QRCodeCanvas id="checkin-qr-canvas" value={checkInUrl} size={512} level="M" />
        </div>

        <div className="flex justify-center p-4 bg-white rounded-xl border dark:border-gray-700">
          <QRCodeSVG value={checkInUrl} size={220} level="M" />
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-3">
          Scan at the door to check {registrantName.split(' ')[0]} in.
        </p>

        <div className="flex gap-2 mt-5">
          <Button variant="outline" onClick={copyLink} className="flex-1 gap-2">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy Link'}
          </Button>
          <Button onClick={downloadPng} className="flex-1 gap-2">
            <Download className="w-4 h-4" /> Download
          </Button>
        </div>
      </div>
    </div>
  );
}
