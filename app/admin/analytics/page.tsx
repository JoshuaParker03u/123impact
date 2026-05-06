'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminNavigation from '@/components/admin/AdminNavigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Loader2, Users, TrendingUp, Download } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, Legend,
} from 'recharts';

type PerEvent = {
  event_id: string;
  title:    string;
  date:     string;
  new:      number;
  returning: number;
};

type OrgAnalytics = {
  new_vs_returning:        { new: number; returning: number };
  per_event:               PerEvent[];
  volunteer_base_over_time: { month: string; total: number }[];
};

function StatCard({ label, value, sub, icon }: { label: string; value: number; sub?: string; icon: React.ReactNode }) {
  return (
    <Card className="p-5 flex items-start gap-4">
      <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex-shrink-0">{icon}</div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value.toLocaleString()}</p>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </Card>
  );
}

function downloadSvg(elementId: string, filename: string) {
  const el    = document.getElementById(elementId);
  const svgEl = el?.querySelector('svg');
  if (!svgEl) return;
  const blob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function AnalyticsPage() {
  const { currentOrganization: organization } = useOrganization() as any;
  const [data, setData]       = useState<OrgAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/organizations/${organization.id}/analytics`);
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to load');
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [organization?.id]);

  useEffect(() => { load(); }, [load]);

  const total = data
    ? data.new_vs_returning.new + data.new_vs_returning.returning
    : 0;
  const returningPct = total > 0
    ? Math.round((data!.new_vs_returning.returning / total) * 100)
    : 0;

  return (
    <>
      <AdminNavigation />
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Volunteer Analytics</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Org-wide volunteer health — all events, all time
            </p>
          </div>
          {organization?.id && (
            <a href={`/api/organizations/${organization.id}/analytics/export`} download>
              <Button variant="outline" className="gap-2">
                <Download className="w-4 h-4" /> Export CSV
              </Button>
            </a>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : error ? (
          <Card className="p-8 text-center text-red-500">{error}</Card>
        ) : !data || total === 0 ? (
          <Card className="p-12 text-center text-gray-500 dark:text-gray-400">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">No volunteer data yet</p>
            <p className="text-sm mt-1">Analytics will appear once registrations come in.</p>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard
                label="Total Unique Volunteers"
                value={data.volunteer_base_over_time.length > 0
                  ? data.volunteer_base_over_time[data.volunteer_base_over_time.length - 1].total
                  : 0}
                icon={<Users className="w-5 h-5 text-blue-600" />}
              />
              <StatCard
                label="New Volunteers"
                value={data.new_vs_returning.new}
                sub={`${total > 0 ? Math.round((data.new_vs_returning.new / total) * 100) : 0}% of all registrations`}
                icon={<TrendingUp className="w-5 h-5 text-green-600" />}
              />
              <StatCard
                label="Returning Volunteers"
                value={data.new_vs_returning.returning}
                sub={`${returningPct}% loyalty rate`}
                icon={<Users className="w-5 h-5 text-indigo-600" />}
              />
            </div>

            {/* Volunteer base over time */}
            {data.volunteer_base_over_time.length > 1 && (
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                    Volunteer Base Growth
                  </h2>
                  <button
                    onClick={() => downloadSvg('chart-base-growth', 'volunteer-base-growth.svg')}
                    className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" /> SVG
                  </button>
                </div>
                <div id="chart-base-growth">
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={data.volunteer_base_over_time} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="total"
                        name="Total Volunteers"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            {/* New vs returning per event */}
            {data.per_event.length > 0 && (
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                    New vs. Returning by Event
                  </h2>
                  <button
                    onClick={() => downloadSvg('chart-per-event', 'new-vs-returning-by-event.svg')}
                    className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" /> SVG
                  </button>
                </div>
                {data.per_event.length <= 8 ? (
                  <div id="chart-per-event">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart
                        data={data.per_event.map((e) => ({
                          name: e.title.length > 18 ? e.title.substring(0, 16) + '…' : e.title,
                          New: e.new,
                          Returning: e.returning,
                        }))}
                        margin={{ top: 4, right: 8, left: -16, bottom: 40 }}
                      >
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="New"       fill="#10b981" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="Returning" fill="#6366f1" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  // Table view for many events
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                          <th className="pb-2 font-medium pr-4">Event</th>
                          <th className="pb-2 font-medium pr-4">Date</th>
                          <th className="pb-2 font-medium pr-4 text-right">New</th>
                          <th className="pb-2 font-medium pr-4 text-right">Returning</th>
                          <th className="pb-2 font-medium text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {data.per_event.map((e) => (
                          <tr key={e.event_id} className="text-gray-700 dark:text-gray-300">
                            <td className="py-2 pr-4 font-medium">{e.title}</td>
                            <td className="py-2 pr-4 text-gray-500">{e.date}</td>
                            <td className="py-2 pr-4 text-right text-green-600 dark:text-green-400">{e.new}</td>
                            <td className="py-2 pr-4 text-right text-indigo-600 dark:text-indigo-400">{e.returning}</td>
                            <td className="py-2 text-right font-medium">{e.new + e.returning}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}
