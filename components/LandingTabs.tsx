'use client';

import { useState } from 'react';
import { CalendarDays, Users, MessageSquare, BarChart3, ImageIcon } from 'lucide-react';

const tabs = [
  {
    id: 'events',
    label: 'Events',
    icon: CalendarDays,
    headline: 'Create events in minutes',
    description:
      'Build a fully public-facing event page with a single form. Single-day or multi-day, in-person or online — your signup page is live the moment you save.',
    points: [
      'Public signup pages with no extra setup',
      'Single-day and multi-day event support',
      'Per-day schedule with custom open and close times',
      'Online, in-person, and hybrid formats',
      'Status management: active, ongoing, completed, or cancelled',
    ],
  },
  {
    id: 'shifts',
    label: 'Shift Management',
    icon: Users,
    headline: 'Fill shifts without the back-and-forth',
    description:
      'Define exactly what help you need and let volunteers pick what works for them. Track fill rates across every shift at a glance, and copy shifts instantly to save setup time.',
    points: [
      'Capacity limits per shift with real-time fill tracking',
      'Volunteers self-register from their phone or computer',
      'Copy shifts to save time on recurring roles',
      'Overnight shift support with automatic date handling',
      'Role-based shift visibility and assignment',
    ],
  },
  {
    id: 'messaging',
    label: 'Messaging',
    icon: MessageSquare,
    headline: 'Keep every volunteer informed',
    description:
      'Send updates, reminders, and announcements directly to your volunteers. Automated confirmation emails go out the moment someone registers, so nothing falls through the cracks.',
    points: [
      'Automated registration confirmation emails',
      'Direct messaging to volunteers before and after events',
      'Real-time notifications for organizers',
      'Custom email templates per organization',
      'Digest notifications for new registrations',
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    headline: 'Know exactly how your program is performing',
    description:
      'Track attendance, registration trends, and staffing levels across all your events. Export your data whenever you need it for reporting or grant applications.',
    points: [
      'Shift fill rates and attendance tracking',
      'Volunteer registration trends over time',
      'Understaffed shift alerts before your event',
      'Per-event and organization-wide reporting',
      'Data export for external reporting',
    ],
  },
];

export default function LandingTabs() {
  const [activeId, setActiveId] = useState(tabs[0].id);
  const active = tabs.find((t) => t.id === activeId)!;

  return (
    <section className="py-20 px-4 bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-50 mb-3">
            A closer look
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-lg max-w-xl mx-auto">
            Every tool you need, built to work together.
          </p>
        </div>

        {/* Tab buttons */}
        <div className="flex flex-wrap gap-2 justify-center mb-10">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveId(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                activeId === tab.id
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white border-transparent'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          {/* Text side */}
          <div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-3">
              {active.headline}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
              {active.description}
            </p>
            <ul className="space-y-2.5">
              {active.points.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                  <span className="mt-0.5 w-4 h-4 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shrink-0">
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                      <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* Visual placeholder */}
          <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 aspect-video flex flex-col items-center justify-center gap-3 text-gray-400 dark:text-gray-600">
            <ImageIcon className="w-8 h-8" />
            <span className="text-sm font-medium">Screenshot coming soon</span>
          </div>
        </div>
      </div>
    </section>
  );
}
