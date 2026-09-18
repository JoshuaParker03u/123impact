'use client';

import { useState } from 'react';
import MessageComposer from '@/components/MessageComposer';
import SentMessagesHistory from '@/components/SentMessagesHistory';
import ScheduledMessagesList from '@/components/ScheduledMessagesList';

type SubTab = 'send' | 'scheduled' | 'history';

// The Messages feature's own content (send/scheduled/history) — no page
// chrome of its own, so it can be dropped into a tab on another page
// (currently the Volunteers page) rather than needing its own nav entry.
export default function MessagesSection() {
  const [showComposer, setShowComposer] = useState(false);
  const [activeTab, setActiveTab] = useState<SubTab>('send');

  const tabs: { id: SubTab; label: string }[] = [
    { id: 'send',      label: 'Send Message' },
    { id: 'scheduled', label: 'Scheduled' },
    { id: 'history',   label: 'Sent Messages' },
  ];

  return (
    <div>
      <div className="mb-6 border-b dark:border-gray-700">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 px-2 font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'send' && (
        <div>
          <button
            onClick={() => setShowComposer(true)}
            className="bg-gradient-to-br from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg hover:opacity-90 font-medium"
          >
            📧 Compose New Message
          </button>

          <MessageComposer
            isOpen={showComposer}
            onClose={() => setShowComposer(false)}
          />
        </div>
      )}

      {activeTab === 'scheduled' && <ScheduledMessagesList />}
      {activeTab === 'history'   && <SentMessagesHistory />}
    </div>
  );
}
