import { useOrganization } from '@/contexts/OrganizationContext';

/**
 * Hook to switch between organizations
 * Returns current organization and method to switch
 */
export function useOrganizationSwitch() {
  const {
    currentOrganization,
    switchOrganization,
    organizations,
    hasMultipleOrganizations,
  } = useOrganization();

  return {
    currentOrganization,
    currentOrgId:   currentOrganization?.id,
    currentOrgName: currentOrganization?.name,
    switchOrganization,
    canSwitch: hasMultipleOrganizations,
    availableOrganizations: organizations,
  };
}
