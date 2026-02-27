'use client';

import { useState, useEffect } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { createBrowserClient } from '@supabase/ssr';
import AdminNavigation from '@/components/admin/AdminNavigation';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Users, Calendar, Clock, Mail, Phone, Loader2, Search, X } from 'lucide-react';

export default function AdminVolunteersPage() {
  const { currentOrganization, loading: orgLoading } = useOrganization();
  const [volunteers, setVolunteers] = useState([]);
  const [filteredVolunteers, setFilteredVolunteers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  const [events, setEvents] = useState([]);
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  useEffect(() => {
    if (currentOrganization) {
      fetchData();
    }
  }, [currentOrganization]);

  useEffect(() => {
    filterVolunteers();
  }, [searchTerm, eventFilter, volunteers]);

  const fetchData = async () => {
    if (!currentOrganization) return;

    setLoading(true);

    try {
      // Fetch all events for this organization
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, title, event_id')
        .eq('organization_id', currentOrganization.id)
        .order('date', { ascending: false });

      if (eventsError) {
        console.error('Error fetching events:', eventsError);
        setEvents([]);
      } else {
        setEvents(eventsData || []);
      }

      const eventIds = eventsData?.map(e => e.id) || [];
      
      if (eventIds.length === 0) {
        setVolunteers([]);
        setFilteredVolunteers([]);
        setLoading(false);
        return;
      }

      // Fetch shifts for these events
      const { data: shiftsData, error: shiftsError } = await supabase
        .from('shifts')
        .select('id')
        .in('event_id', eventIds);

      if (shiftsError) {
        console.error('Error fetching shifts:', shiftsError);
        setVolunteers([]);
        setFilteredVolunteers([]);
        setLoading(false);
        return;
      }

      const shiftIds = shiftsData?.map(s => s.id) || [];

      if (shiftIds.length === 0) {
        setVolunteers([]);
        setFilteredVolunteers([]);
        setLoading(false);
        return;
      }

      // Fetch volunteer registrations for these shifts
      const { data: volunteersData, error: volunteersError } = await supabase
        .from('volunteer_registrations')
        .select(`
          id,
          name,
          email,
          phone,
          registered_at,
          shift_id,
          shifts (
            id,
            name,
            start_time,
            end_time,
            event_id,
            events (
              id,
              title,
              event_id,
              date
            )
          )
        `)
        .in('shift_id', shiftIds)
        .order('registered_at', { ascending: false });

      if (volunteersError) {
        console.error('Error fetching volunteers:', volunteersError);
        setVolunteers([]);
      } else {
        setVolunteers(volunteersData || []);
        setFilteredVolunteers(volunteersData || []);
      }
    } catch (error) {
      console.error('Unexpected error in fetchData:', error);
    } finally {
      setLoading(false);
    }
  };

  const removeVolunteer = async (volunteer) => {
    if (!confirm(`Remove ${volunteer.name} from ${volunteer.shifts?.name}?`)) return;

    const { error } = await supabase
      .from('volunteer_registrations')
      .delete()
      .eq('id', volunteer.id);

    if (error) {
      alert('Failed to remove volunteer: ' + error.message);
      return;
    }

    // Decrement shift filled count
    await supabase.rpc('decrement_shift_filled', { p_shift_id: volunteer.shift_id });

    // Cancel any pending scheduled messages to this volunteer
    await fetch(
      `/api/messages/cancel-volunteer?email=${encodeURIComponent(volunteer.email)}&org_id=${currentOrganization.id}`,
      { method: 'DELETE' }
    );

    setVolunteers((prev) => prev.filter((v) => v.id !== volunteer.id));
  };

  const filterVolunteers = () => {
    let filtered = volunteers;

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(v =>
        v.name.toLowerCase().includes(search) ||
        v.email.toLowerCase().includes(search)
      );
    }

    // Event filter
    if (eventFilter !== 'all') {
      filtered = filtered.filter(v => v.shifts?.events?.id === eventFilter);
    }

    setFilteredVolunteers(filtered);
  };

  if (orgLoading) {
    return (
      <>
        <AdminNavigation />
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </>
    );
  }

  if (!currentOrganization) {
    return (
      <>
        <AdminNavigation />
        <div className="container mx-auto px-4 py-8">
          <Card className="p-8 text-center">
            <p className="text-gray-600">No organization selected</p>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <AdminNavigation />
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Volunteers</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage volunteer registrations for {currentOrganization.name}
          </p>
        </div>

        {/* Filters */}
        <Card className="p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="border rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
            >
              <option value="all">All Events</option>
              {events.map(event => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
          </div>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-full">
                <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Volunteers</p>
                <p className="text-2xl font-bold">{volunteers.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-full">
                <Calendar className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Active Events</p>
                <p className="text-2xl font-bold">{events.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-full">
                <Clock className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Showing</p>
                <p className="text-2xl font-bold">{filteredVolunteers.length}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        )}

        {/* Empty State */}
        {!loading && volunteers.length === 0 && (
          <Card className="p-12 text-center">
            <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">No volunteers yet</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Volunteers will appear here once they sign up for your events
            </p>
          </Card>
        )}

        {/* Volunteers Table */}
        {!loading && filteredVolunteers.length > 0 && (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                  <tr>
                    <th className="text-left p-4 font-semibold">Volunteer</th>
                    <th className="text-left p-4 font-semibold">Event</th>
                    <th className="text-left p-4 font-semibold">Shift</th>
                    <th className="text-left p-4 font-semibold">Registered</th>
                    <th className="p-4" />
                  </tr>
                </thead>
                <tbody>
                  {filteredVolunteers.map((volunteer) => (
                    <tr key={volunteer.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="p-4">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">{volunteer.name}</p>
                          <div className="flex items-center gap-3 mt-1 text-sm text-gray-600 dark:text-gray-400">
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {volunteer.email}
                            </span>
                            {volunteer.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {volunteer.phone}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {volunteer.shifts?.events?.title || 'N/A'}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {volunteer.shifts?.events?.date || ''}
                          </p>
                        </div>
                      </td>
                      <td className="p-4">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {volunteer.shifts?.name || 'N/A'}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {volunteer.shifts?.start_time || ''} - {volunteer.shifts?.end_time || ''}
                          </p>
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {new Date(volunteer.registered_at).toLocaleDateString()}
                        </p>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => removeVolunteer(volunteer)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          title="Remove from shift"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* No Results After Filter */}
        {!loading && volunteers.length > 0 && filteredVolunteers.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-gray-600 dark:text-gray-400">No volunteers match your filters</p>
          </Card>
        )}
      </div>
    </>
  );
}