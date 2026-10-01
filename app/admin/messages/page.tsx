import { redirect } from 'next/navigation';

// Messages now lives as a tab on the Volunteers page rather than its own
// top-level nav entry — redirect any existing links/bookmarks there instead
// of maintaining two separate UIs for the same feature.
export default function MessagesPage() {
  redirect('/admin/volunteers?tab=messages');
}
