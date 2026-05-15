'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getBrowserClient } from '@/lib/supabase';

const OrganizationContext = createContext(undefined);

const STORAGE_KEY = '123impact_current_org_id';

export function OrganizationProvider({ children }) {
  const [organizations, setOrganizations] = useState([]);
  const [currentOrganization, setCurrentOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const hasLoadedRef = useRef(false);

  const loadOrganizations = useCallback(async () => {
    const firstLoad = !hasLoadedRef.current;
    try {
      if (firstLoad) setLoading(true);
      setError(null);

      const response = await fetch('/api/organizations/user');

      if (!response.ok) {
        if (response.status === 401) {
          setOrganizations([]);
          setCurrentOrganization(null);
          return;
        }
        throw new Error('Failed to load organizations');
      }

      const { data } = await response.json();
      const orgs = data ?? [];
      hasLoadedRef.current = true;
      setOrganizations(orgs);

      const savedOrgId =
        typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      const savedOrg = savedOrgId ? orgs.find((o) => o.id === savedOrgId) : null;
      const orgToSelect = savedOrg ?? orgs[0] ?? null;

      setCurrentOrganization(orgToSelect);

      if (orgToSelect && typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, orgToSelect.id);
      }
    } catch (err) {
      console.error('Error loading organizations:', err);
      setError(err.message);
    } finally {
      if (firstLoad) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrganizations();

    const { data: { subscription } } = getBrowserClient().auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        loadOrganizations();
      }
      if (event === 'INITIAL_SESSION' && session) {
        loadOrganizations();
      }
      if (event === 'SIGNED_OUT') {
        setOrganizations([]);
        setCurrentOrganization(null);
        // Don't redirect here — the middleware handles protecting routes on next navigation.
        // Redirecting here causes spurious "session expired" messages during OAuth sign-in
        // when Supabase fires SIGNED_OUT to replace the old session with the new one.
      }
    });

    return () => subscription.unsubscribe();
  }, [loadOrganizations]);

  const switchOrganization = useCallback(
    (orgId) => {
      const org = organizations.find((o) => o.id === orgId);
      if (!org) return;
      setCurrentOrganization(org);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, orgId);
      }
    },
    [organizations]
  );

  const value = {
    currentOrganization,
    organizations,
    loading,
    error,
    switchOrganization,
    refreshOrganization: loadOrganizations,
    refreshOrganizations: loadOrganizations,
    hasMultipleOrganizations: organizations.length > 1,
    // Computed helpers
    isAdmin: ['owner', 'admin'].includes(currentOrganization?.role),
    userRole: currentOrganization?.role ?? null,
    userPermissions: currentOrganization?.permissions ?? {},
  };

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}
