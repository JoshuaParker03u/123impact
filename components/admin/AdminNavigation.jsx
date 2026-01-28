'use client';

import { useOrganizationSwitch } from '@/hooks/useOrganizationSwitch';
import { Building2 } from 'lucide-react';
import Link from 'next/link';

export default function AdminNavigation() {
  const { 
    currentOrgName, 
    currentOrgId,
    switchOrganization, 
    canSwitch, 
    availableOrganizations 
  } = useOrganizationSwitch();

  return (
    <nav className="bg-white border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left side - Navigation links */}
          <div className="flex items-center space-x-8">
            <Link href="/admin/events" className="text-gray-700 hover:text-blue-600 font-medium">
              Events
            </Link>
            <Link href="/admin/volunteers" className="text-gray-700 hover:text-blue-600 font-medium">
              Volunteers
            </Link>
            <Link href="/admin/organizations" className="text-gray-700 hover:text-blue-600 font-medium">
              Organizations
            </Link>
          </div>

          {/* Right side - Organization switcher */}
          {canSwitch ? (
            <div className="flex items-center">
              <Building2 className="w-4 h-4 mr-2 text-gray-500" />
              <select
                value={currentOrgId || ''}
                onChange={(e) => switchOrganization(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {availableOrganizations.map(org => (
                  <option key={org.organization_id} value={org.organization_id}>
                    {org.organization_name}
                  </option>
                ))}
              </select>
            </div>
          ) : currentOrgName ? (
            <div className="flex items-center text-gray-600">
              <Building2 className="w-4 h-4 mr-2" />
              <span className="text-sm font-medium">{currentOrgName}</span>
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
