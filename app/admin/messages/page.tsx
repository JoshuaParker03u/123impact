'use client';

import { useState } from 'react';
import MessageComposer from '@/components/MessageComposer';
import SentMessagesHistory from '@/components/SentMessagesHistory';
import ScheduledMessagesList from '@/components/ScheduledMessagesList';

type Tab = 'send' | 'scheduled' | 'history';

export default function MessagesPage() {
  const [showComposer, setShowComposer] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('send');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'send',      label: 'Send Message' },
    { id: 'scheduled', label: 'Scheduled' },
    { id: 'history',   label: 'Sent Messages' },
  ];

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Messages</h1>
        <p className="text-gray-600 dark:text-gray-400">Send messages to volunteers and view delivery history</p>
      </div>

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
