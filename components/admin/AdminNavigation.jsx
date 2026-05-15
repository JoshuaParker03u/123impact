'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useOrganizationSwitch } from '@/hooks/useOrganizationSwitch';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Heart, LogOut, ChevronDown, Check, Plus, Bell, Settings, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
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

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AdminNavigation() {
  const {
    currentOrganization,
    availableOrganizations,
    switchOrganization,
  } = useOrganizationSwitch();

  const { refreshOrganization } = useOrganization();

  const [dropdownOpen, setDropdownOpen]       = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [notifOpen, setNotifOpen]             = useState(false);
  const [notifications, setNotifications]     = useState([]);
  const [notifLoading, setNotifLoading]       = useState(false);
  const [userName, setUserName]               = useState('');
  const [mobileMenuOpen, setMobileMenuOpen]   = useState(false);
  const dropdownRef = useRef(null);
  const notifRef    = useRef(null);
  const router = useRouter();

  const supabase = getBrowserClient();

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const fetchNotifications = useCallback(async () => {
    setNotifLoading(true);
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) setNotifications(await res.json());
    } finally {
      setNotifLoading(false);
    }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  useEffect(() => {
    const setName = (user) => {
      if (!user) return;
      const name = user.user_metadata?.full_name;
      const email = user.email || '';
      setUserName(name ? `${name} (${email})` : email);
    };

    supabase.auth.getUser().then(({ data: { user } }) => setName(user));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setName(session?.user ?? null);
      }
      if (event === 'SIGNED_OUT') {
        setUserName('');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const markAllRead = async () => {
    await fetch('/api/notifications', { method: 'PATCH' });
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  };

  const markRead = async (id, link) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n));
    await fetch(`/api/notifications/${id}`, { method: 'PATCH' });
    setNotifOpen(false);
    if (link) router.push(link);
  };

  const dismissNotification = async (e, id) => {
    e.stopPropagation();
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
  };

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
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
    router.push('/dashboard');
  };

  const handleCreateSuccess = async (newOrg) => {
    setShowCreateModal(false);
    // Pre-set localStorage so the refresh auto-selects the new org
    localStorage.setItem('123impact_current_org_id', newOrg.id);
    await refreshOrganization();
  };

  const navLinkClass = 'text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium';

  return (
    <>
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm dark:bg-gray-950 border-b border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex justify-between h-16">

          {/* Left — Brand + Nav links (desktop) */}
          <div className="flex items-center space-x-8">
            <Link href="/" className="flex items-center gap-2 flex-shrink-0">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Heart className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                123impact
              </span>
            </Link>

            {/* Desktop nav links */}
            <div className="hidden md:flex items-center space-x-8">
              <Link href="/dashboard" className={navLinkClass}>Dashboard</Link>
              <Link href="/admin/events" className={navLinkClass}>Events</Link>
              <Link href="/admin/volunteers" className={navLinkClass}>Volunteers</Link>
              <Link href="/admin/analytics" className={navLinkClass}>Analytics</Link>
              {currentOrganization ? (
                <Link href="/admin/organizations" className={navLinkClass}>Organization</Link>
              ) : (
                <button onClick={() => setShowCreateModal(true)} className={navLinkClass}>
                  Organization
                </button>
              )}
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-2">

            {/* Org Switcher — desktop only */}
            <div className="relative hidden md:block" ref={dropdownRef}>
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
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Your Organization</p>
                  </div>
                  <ul className="py-1 max-h-64 overflow-y-auto">
                    {availableOrganizations.length === 0 ? (
                      <li className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">No organizations yet</li>
                    ) : availableOrganizations.map((org) => {
                      const isCurrent = currentOrganization && org.id === currentOrganization.id;
                      return (
                        <li key={org.id}>
                          <button
                            onClick={() => handleSwitch(org.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${isCurrent ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                          >
                            <OrgAvatar org={org} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{org.name}</p>
                              <RoleBadge role={org.role} />
                            </div>
                            {isCurrent && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
                          </button>
                        </li>
                      );
                    })}
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

            {/* Theme toggle — desktop only */}
            <div className="hidden md:block">
              <ThemeToggle />
            </div>

            {/* Notification Bell — always visible */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => { setNotifOpen((o) => !o); if (!notifOpen) fetchNotifications(); }}
                className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="fixed top-16 left-2 right-2 md:absolute md:top-full md:left-auto md:right-0 md:mt-2 md:w-96 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</p>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                        Mark all as read
                      </button>
                    )}
                  </div>
                  <ul className="max-h-[420px] overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
                    {notifLoading ? (
                      <li className="px-4 py-6 text-center text-sm text-gray-400">Loading…</li>
                    ) : notifications.length === 0 ? (
                      <li className="px-4 py-6 text-center text-sm text-gray-400">No notifications yet</li>
                    ) : notifications.map((n) => (
                      <li key={n.id} className={`flex items-start ${!n.read_at ? 'bg-blue-50/60 dark:bg-blue-900/10' : ''}`}>
                        <button
                          onClick={() => markRead(n.id, n.link)}
                          className="flex-1 text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <div className="flex items-start gap-2.5">
                            {!n.read_at && <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
                            <div className={!n.read_at ? '' : 'ml-4'}>
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug">{n.title}</p>
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 leading-snug">{n.body}</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{timeAgo(n.created_at)}</p>
                            </div>
                          </div>
                        </button>
                        <button
                          onClick={(e) => dismissNotification(e, n.id)}
                          className="p-2 mt-1 mr-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
                          title="Dismiss"
                        >
                          <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Settings + username combined — desktop only */}
            <Link
              href="/admin/settings"
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />
              {userName && (
                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium max-w-[200px] break-all leading-tight">
                  {userName}
                </span>
              )}
            </Link>

            {/* Sign Out — rightmost desktop element */}
            <Button
              variant="outline"
              onClick={handleLogout}
              className="hidden md:flex gap-2 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>

            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMobileMenuOpen((o) => !o)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5 text-gray-600 dark:text-gray-400" /> : <Menu className="w-5 h-5 text-gray-600 dark:text-gray-400" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu panel */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-4 py-3 space-y-1">

          {/* Nav links */}
          {[
            { href: '/dashboard',           label: 'Dashboard' },
            { href: '/admin/events',         label: 'Events' },
            { href: '/admin/volunteers',     label: 'Volunteers' },
            { href: '/admin/analytics',      label: 'Analytics' },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2.5 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium"
            >
              {label}
            </Link>
          ))}

          {currentOrganization ? (
            <Link
              href="/admin/organizations"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2.5 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium"
            >
              Organization
            </Link>
          ) : (
            <button
              onClick={() => { setMobileMenuOpen(false); setShowCreateModal(true); }}
              className="w-full text-left px-3 py-2.5 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium"
            >
              Organization
            </button>
          )}

          <div className="border-t border-gray-100 dark:border-gray-800 pt-2 mt-2 space-y-1">

            {/* Org switcher */}
            <div className="px-3 py-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Organization</p>
              {availableOrganizations.length === 0 ? (
                <p className="text-sm text-gray-500">No organizations yet</p>
              ) : availableOrganizations.map((org) => {
                const isCurrent = currentOrganization && org.id === currentOrganization.id;
                return (
                  <button
                    key={org.id}
                    onClick={() => { handleSwitch(org.id); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left mb-1 transition-colors ${isCurrent ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                  >
                    <OrgAvatar org={org} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{org.name}</p>
                      <RoleBadge role={org.role} />
                    </div>
                    {isCurrent && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
                  </button>
                );
              })}
              <button
                onClick={() => { setMobileMenuOpen(false); setShowCreateModal(true); }}
                className="w-full flex items-center gap-2 px-2 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg font-medium"
              >
                <Plus className="w-4 h-4" />
                Create New Organization
              </button>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800 pt-2 space-y-1">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">Theme</span>
                <ThemeToggle />
              </div>

              <Link
                href="/admin/settings"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium"
              >
                <Settings className="w-4 h-4" />
                Settings
              </Link>

              {userName && (
                <p className="px-3 py-1 text-xs text-gray-400 dark:text-gray-500 truncate">{userName}</p>
              )}

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
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
