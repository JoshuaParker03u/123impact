'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const OrganizationContext = createContext(undefined);

export function OrganizationProvider({ children }) {
  const [currentOrganization, setCurrentOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  useEffect(() => {
    loadOrganization();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        loadOrganization();
      } else if (event === 'SIGNED_OUT') {
        setCurrentOrganization(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadOrganization = async () => {
    try {
      setLoading(true);
      
      // Get the current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setLoading(false);
        return;
      }

      // Fetch the user's organization through organization_admins junction table
      const { data: adminData, error: adminError } = await supabase
        .from('organization_admins')
        .select(`
          role,
          permissions,
          organization_id,
          organizations (
            id,
            name,
            description,
            website,
            contact_email,
            contact_phone,
            address,
            city,
            state,
            zip_code,
            logo_url,
            status
          )
        `)
        .eq('user_id', user.id)
        .maybeSingle();

      if (adminError) {
        console.error('Error loading organization admin data:', {
          message: adminError.message,
          details: adminError.details,
          hint: adminError.hint,
          code: adminError.code,
          full: adminError
        });
      }

      if (adminData && adminData.organizations) {
        setCurrentOrganization({
          ...adminData.organizations,
          userRole: adminData.role,
          userPermissions: adminData.permissions,
          isAdmin: true
        });
        return;
      }

      // If the nested query failed, try a simpler approach
      if (!adminData || !adminData.organizations) {
        console.log('Trying fallback query for organization data...');
        
        // First get the organization_id from organization_admins
        const { data: adminRecord, error: recordError } = await supabase
          .from('organization_admins')
          .select('organization_id, role, permissions')
          .eq('user_id', user.id)
          .maybeSingle();

        if (recordError) {
          console.error('Error fetching admin record:', recordError);
        }

        if (adminRecord) {
          // Then fetch the organization separately
          const { data: orgData, error: orgError } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', adminRecord.organization_id)
            .single();

          if (orgError) {
            console.error('Error fetching organization:', orgError);
          }

          if (orgData) {
            setCurrentOrganization({
              ...orgData,
              userRole: adminRecord.role,
              userPermissions: adminRecord.permissions,
              isAdmin: true
            });
            return;
          }
        }
      }

      // If not an admin, check if they're a volunteer
      const { data: volunteerData, error: volunteerError } = await supabase
        .from('organization_volunteers')
        .select(`
          status,
          organization_id,
          organizations (
            id,
            name,
            description,
            website,
            contact_email,
            contact_phone,
            address,
            city,
            state,
            zip_code,
            logo_url,
            status
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (volunteerError) {
        console.error('Error loading organization volunteer data:', {
          message: volunteerError.message,
          details: volunteerError.details,
          hint: volunteerError.hint,
          code: volunteerError.code
        });
      }

      if (volunteerData && volunteerData.organizations) {
        setCurrentOrganization({
          ...volunteerData.organizations,
          userRole: 'volunteer',
          userPermissions: {},
          isAdmin: false,
          isVolunteer: true
        });
        return;
      }

      // Fallback for volunteer data
      if (!volunteerData || !volunteerData.organizations) {
        const { data: volunteerRecord, error: volRecordError } = await supabase
          .from('organization_volunteers')
          .select('organization_id, status')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (volRecordError) {
          console.error('Error fetching volunteer record:', volRecordError);
        }

        if (volunteerRecord) {
          const { data: orgData, error: orgError } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', volunteerRecord.organization_id)
            .single();

          if (orgError) {
            console.error('Error fetching organization for volunteer:', orgError);
          }

          if (orgData) {
            setCurrentOrganization({
              ...orgData,
              userRole: 'volunteer',
              userPermissions: {},
              isAdmin: false,
              isVolunteer: true
            });
          }
        }
      }
    } catch (error) {
      console.error('Error in loadOrganization:', error);
    } finally {
      setLoading(false);
    }
  };

  const value = {
    currentOrganization,
    setCurrentOrganization,
    loading,
    refreshOrganization: loadOrganization,
    // Helper computed values
    isAdmin: currentOrganization?.isAdmin || false,
    isVolunteer: currentOrganization?.isVolunteer || false,
    userRole: currentOrganization?.userRole || null,
    userPermissions: currentOrganization?.userPermissions || {},
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