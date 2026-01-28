import { useOrganization } from '@/contexts/OrganizationContext';

/**
 * Hook to access user's organizations
 * Returns all organizations the user belongs to and related state
 */
export function useOrganizations() {
  const { 
    organizations, 
    loading, 
    error, 
    refreshOrganizations,
    hasMultipleOrganizations 
  } = useOrganization();

  return {
    organizations,
    loading,
    error,
    refreshOrganizations,
    hasMultipleOrganizations,
  };
}
