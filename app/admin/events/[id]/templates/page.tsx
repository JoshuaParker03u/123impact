'use client';

import { useState, useEffect } from 'react';
import { getBrowserClient } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import EmailTemplateEditor from '@/components/EmailTemplateEditor';
import AdminNavigation from '@/components/admin/AdminNavigation';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal';
import { useOrganization } from '@/contexts/OrganizationContext';

const supabase = getBrowserClient();

export default function EventTemplatesPage() {
  const params = useParams();
  const eventId = params.id as string;
  const { isAdmin: canManage } = useOrganization() as { isAdmin: boolean };
  const [event, setEvent] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    
    const { data: eventData } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();
    
    setEvent(eventData);

    const response = await fetch(`/api/templates?eventId=${eventId}`);
    const templatesData = await response.json();
    setTemplates(templatesData);

    setLoading(false);
  }

  async function handleDelete() {
    if (!deletingTemplate) return;
    setDeleting(true);
    await fetch(`/api/templates?id=${deletingTemplate.id}`, { method: 'DELETE' });
    setDeleting(false);
    setDeletingTemplate(null);
    loadData();
  }

  function getTriggerLabel(type: string) {
    const labels: Record<string, string> = {
      signup: 'Upon sign-up',
      '7_days_before': '7 days before',
      '24_hours_before': '24 hours before',
      '1_hour_before': '1 hour before',
    };
    return labels[type] || type;
  }

  if (loading) {
    return (
      <>
        <AdminNavigation />
        <div className="flex justify-center items-center h-64 text-gray-500 dark:text-gray-400">Loading...</div>
      </>
    );
  }

  if (showEditor) {
    return (
      <>
        <AdminNavigation />
        <div className="container mx-auto p-6">
          <Link
            href={event?.event_id ? `/admin/events/${event.event_id}` : '/admin/events'}
            className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mb-6"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Event
          </Link>
          <EmailTemplateEditor
            eventId={eventId}
            template={editingTemplate}
            onSave={() => {
              setShowEditor(false);
              setEditingTemplate(null);
              loadData();
            }}
            onCancel={() => {
              setShowEditor(false);
              setEditingTemplate(null);
            }}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminNavigation />
      <div className="container mx-auto p-6">
      <Link
        href={event?.event_id ? `/admin/events/${event.event_id}` : '/admin/events'}
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Event
      </Link>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-gray-100">Email Templates</h1>
          <p className="text-gray-600 dark:text-gray-400">{event?.title}</p>
        </div>
        {canManage && (
          <button
            onClick={() => {
              setEditingTemplate(null);
              setShowEditor(true);
            }}
            className="bg-gradient-to-br from-blue-600 to-purple-600 text-white px-4 py-2 rounded-lg hover:opacity-90"
          >
            + Create Template
          </button>
        )}
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <p className="text-gray-600 dark:text-gray-400 mb-4">No email templates yet</p>
          {canManage && (
            <button
              onClick={() => setShowEditor(true)}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              Create your first template
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {templates.map((template) => (
            <div key={template.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">{template.name}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Sends: {getTriggerLabel(template.trigger_type)}
                  </p>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  template.enabled
                    ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-400'
                }`}>
                  {template.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <strong>Subject:</strong> {template.subject}
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                  <strong>Preview:</strong> {template.body.substring(0, 150)}...
                </p>
              </div>

              {canManage && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingTemplate(template);
                      setShowEditor(true);
                    }}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeletingTemplate(template)}
                    className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </div>

      {deletingTemplate && (
        <ConfirmDeleteModal
          title="Delete Template"
          message={
            <>
              This will permanently delete <span className="font-medium text-gray-900 dark:text-gray-100">{deletingTemplate.name}</span>. This cannot be undone.
            </>
          }
          loading={deleting}
          onCancel={() => setDeletingTemplate(null)}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
