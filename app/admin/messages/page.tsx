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
        <p className="text-gray-600">Send messages to volunteers and view delivery history</p>
      </div>

      <div className="mb-6 border-b">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 px-2 font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
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
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium"
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
