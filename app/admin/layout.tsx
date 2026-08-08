import type React from 'react';
import AdminNavigation from '@/components/admin/AdminNavigation';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminNavigation />
      {children}
    </>
  );
}
