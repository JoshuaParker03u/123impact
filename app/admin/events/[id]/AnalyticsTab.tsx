'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Loader2, Download, Users, UserCheck, UserX, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, Cell, PieChart, Pie, Tooltip, ResponsiveContainer, Legend, XAxis, YAxis,
} from 'recharts';

type AnalyticsData = {
  total_registrations: number;
  by_attendee_type:    { volunteer: number; attendee: number; speaker: number };
  check_in_summary:    { checked_in: number; not_checked_in: number };
  no_show_rate:        number;
  new_count:           number;
  returning_count:     number;
};

const TYPE_COLORS: Record<string, string> = {
  volunteer: '#3b82f6',
  attendee:  '#8b5cf6',
  speaker:   '#f59e0b',
};

function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: React.ReactNode }) {
  return (
    <Card className="p-5 flex items-start gap-4">
      <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </Card>
  );
}

function downloadSvg(elementId: string, filename: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const svgEl = el.querySelector('svg');
  if (!svgEl) return;
  const blob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AnalyticsTab({ eventId }: { eventId: string }) {
  const [data, setData]       = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/analytics`);
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to load');
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;
  }
  if (error) {
    return <div className="text-center py-12 text-red-500 text-sm">{error}</div>;
  }
  if (!data || data.total_registrations === 0) {
    return (
      <Card className="p-8 text-center text-gray-500 dark:text-gray-400">
        No registrations yet. Analytics will appear once someone registers.
      </Card>
    );
  }

  const typeChartData = [
    { name: 'Volunteers', value: data.by_attendee_type.volunteer, color: TYPE_COLORS.volunteer },
    { name: 'Attendees',  value: data.by_attendee_type.attendee,  color: TYPE_COLORS.attendee  },
    { name: 'Speakers',   value: data.by_attendee_type.speaker,   color: TYPE_COLORS.speaker   },
  ].filter((d) => d.value > 0);

  const newReturnData = [
    { name: 'New',       value: data.new_count,       color: '#10b981' },
    { name: 'Returning', value: data.returning_count, color: '#6366f1' },
  ].filter((d) => d.value > 0);

  const isPostEvent = data.check_in_summary.checked_in > 0 || data.check_in_summary.not_checked_in > 0;

  return (
    <div className="space-y-6">
      {/* Export buttons */}
      <div className="flex justify-end">
        <a href={`/api/events/${eventId}/analytics/export`} download>
          <Button variant="outline" className="gap-2 text-sm">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        </a>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Registrations"
          value={data.total_registrations}
          icon={<Users className="w-5 h-5 text-blue-600" />}
        />
        <StatCard
          label="New Volunteers"
          value={data.new_count}
          sub={`${data.total_registrations > 0 ? Math.round((data.new_count / data.total_registrations) * 100) : 0}% of total`}
          icon={<TrendingUp className="w-5 h-5 text-green-600" />}
        />
        {isPostEvent && (
          <>
            <StatCard
              label="Checked In"
              value={data.check_in_summary.checked_in}
              sub={`${data.total_registrations > 0 ? Math.round((data.check_in_summary.checked_in / data.total_registrations) * 100) : 0}% attendance rate`}
              icon={<UserCheck className="w-5 h-5 text-blue-600" />}
            />
            <StatCard
              label="No-Shows"
              value={data.check_in_summary.not_checked_in}
              sub={`${data.no_show_rate}% no-show rate`}
              icon={<UserX className="w-5 h-5 text-red-500" />}
            />
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendee type breakdown */}
        {typeChartData.length > 0 && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">By Attendee Type</h3>
              <button
                onClick={() => downloadSvg('chart-type-bar', 'attendee-type.svg')}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" /> SVG
              </button>
            </div>
            <div id="chart-type-bar">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={typeChartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {typeChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* New vs Returning */}
        {newReturnData.length > 0 && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">New vs. Returning</h3>
              <button
                onClick={() => downloadSvg('chart-new-returning', 'new-vs-returning.svg')}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" /> SVG
              </button>
            </div>
            <div id="chart-new-returning">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={newReturnData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                  >
                    {newReturnData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* Check-in breakdown (post-event) */}
        {isPostEvent && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Check-In Status</h3>
              <button
                onClick={() => downloadSvg('chart-checkin', 'check-in-status.svg')}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" /> SVG
              </button>
            </div>
            <div id="chart-checkin">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Checked In', value: data.check_in_summary.checked_in,     fill: '#10b981' },
                      { name: 'No-Show',    value: data.check_in_summary.not_checked_in, fill: '#f87171' },
                    ]}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                  >
                    <Cell fill="#10b981" />
                    <Cell fill="#f87171" />
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
