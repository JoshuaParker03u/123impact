'use client';

import { useOrganizationSwitch } from '@/hooks/useOrganizationSwitch';
import { Building2, Heart, LogOut } from 'lucide-react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import ThemeToggle from '@/components/ThemeToggle';

export default function AdminNavigation() {
  const {
    currentOrgName,
    currentOrgId,
    switchOrganization,
    canSwitch,
    availableOrganizations
  } = useOrganizationSwitch();

  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <nav className="bg-white dark:bg-gray-900 border-b dark:border-gray-800">
      <div className="container mx-auto px-4">
        <div className="flex justify-between h-16">
          {/* Left side - Brand + Navigation links */}
          <div className="flex items-center space-x-8">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Heart className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                123impact
              </span>
            </Link>
            <Link href="/admin/events" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium">
              Events
            </Link>
            <Link href="/admin/volunteers" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium">
              Volunteers
            </Link>
            <Link href="/admin/organizations" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium">
              Organizations
            </Link>
            <Link href="/admin/messages"
                  className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-700 dark:text-gray-300">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Messages
            </Link>
          </div>

          {/* Right side - Theme toggle + Organization switcher + Logout */}
          <div className="flex items-center gap-4">
            <ThemeToggle />
            {canSwitch ? (
              <div className="flex items-center">
                <Building2 className="w-4 h-4 mr-2 text-gray-500 dark:text-gray-400" />
                <select
                  value={currentOrgId || ''}
                  onChange={(e) => switchOrganization(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {availableOrganizations.map(org => (
                    <option key={org.organization_id} value={org.organization_id}>
                      {org.organization_name}
                    </option>
                  ))}
                </select>
              </div>
            ) : currentOrgName ? (
              <div className="flex items-center text-gray-600 dark:text-gray-400">
                <Building2 className="w-4 h-4 mr-2" />
                <span className="text-sm font-medium">{currentOrgName}</span>
              </div>
            ) : null}
            <Button variant="outline" onClick={handleLogout} className="gap-2 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
