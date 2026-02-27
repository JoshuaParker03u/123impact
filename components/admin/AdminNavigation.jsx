'use client';

import { useState, useRef, useEffect } from 'react';
import { useOrganizationSwitch } from '@/hooks/useOrganizationSwitch';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Heart, LogOut, ChevronDown, Check, Plus } from 'lucide-react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import ThemeToggle from '@/components/ThemeToggle';
import CreateOrganizationModal from '@/components/admin/CreateOrganizationModal';

// Role badge colours
const roleBadgeClass = {
  owner: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  admin: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
};

function RoleBadge({ role }) {
  const cls = roleBadgeClass[role] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300';
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${cls}`}>
      {role}
    </span>
  );
}

// Org avatar — logo image or coloured initials fallback
function OrgAvatar({ org, size = 'sm' }) {
  const dim = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-9 h-9 text-sm';
  const initials = (org?.name ?? '?').slice(0, 2).toUpperCase();

  if (org?.logo_url) {
    return (
      <img
        src={org.logo_url}
        alt={org.name}
        className={`${dim} rounded-lg object-cover flex-shrink-0`}
      />
    );
  }

  return (
    <div className={`${dim} rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {initials}
    </div>
  );
}

export default function AdminNavigation() {
  const {
    currentOrganization,
    availableOrganizations,
    switchOrganization,
  } = useOrganizationSwitch();

  const { refreshOrganizations } = useOrganization();

  const [dropdownOpen, setDropdownOpen]       = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const dropdownRef = useRef(null);
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const handleSwitch = (orgId) => {
    switchOrganization(orgId);
    setDropdownOpen(false);
  };

  const handleCreateSuccess = async (newOrg) => {
    setShowCreateModal(false);
    // Pre-set localStorage so the refresh auto-selects the new org
    localStorage.setItem('123impact_current_org_id', newOrg.id);
    await refreshOrganizations();
  };

  return (
    <>
    <nav className="sticky top-0 z-50 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex justify-between h-16">

          {/* Left — Brand + Nav links */}
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
            <Link
              href="/admin/messages"
              className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-700 dark:text-gray-300"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Messages
            </Link>
          </div>

          {/* Right — Org switcher + Theme toggle + Sign out */}
          <div className="flex items-center gap-3">
            {/* Org Switcher — always visible */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {currentOrganization ? (
                  <>
                    <OrgAvatar org={currentOrganization} size="sm" />
                    <div className="flex flex-col items-start leading-tight">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 max-w-[140px] truncate">
                        {currentOrganization.name}
                      </span>
                      <RoleBadge role={currentOrganization.role} />
                    </div>
                  </>
                ) : (
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    No organization
                  </span>
                )}
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Your Organizations
                    </p>
                  </div>

                  <ul className="py-1 max-h-64 overflow-y-auto">
                    {availableOrganizations.length === 0 ? (
                      <li className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                        No organizations yet
                      </li>
                    ) : (
                      availableOrganizations.map((org) => {
                        const isCurrent = currentOrganization && org.id === currentOrganization.id;
                        return (
                          <li key={org.id}>
                            <button
                              onClick={() => handleSwitch(org.id)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                                isCurrent ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                              }`}
                            >
                              <OrgAvatar org={org} size="sm" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                  {org.name}
                                </p>
                                <RoleBadge role={org.role} />
                              </div>
                              {isCurrent && (
                                <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                              )}
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>

                  <div className="border-t border-gray-100 dark:border-gray-800 p-2">
                    <button
                      onClick={() => { setDropdownOpen(false); setShowCreateModal(true); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      Create New Organization
                    </button>
                  </div>
                </div>
              )}
            </div>

            <ThemeToggle />

            <Button
              variant="outline"
              onClick={handleLogout}
              className="gap-2 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>

        </div>
      </div>
    </nav>

    {showCreateModal && (
      <CreateOrganizationModal
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
      />
    )}
    </>
  );
}
