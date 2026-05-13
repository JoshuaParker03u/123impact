'use client';

import { useState, useEffect } from 'react';
import { getBrowserClient } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import EmailTemplateEditor from '@/components/EmailTemplateEditor';

const supabase = getBrowserClient();

export default function EventTemplatesPage() {
  const params = useParams();
  const eventId = params.id as string;
  const [event, setEvent] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [showEditor, setShowEditor] = useState(false);

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

  async function handleDelete(templateId: string) {
    if (!confirm('Are you sure you want to delete this template?')) return;

    await fetch(`/api/templates?id=${templateId}`, { method: 'DELETE' });
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
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  if (showEditor) {
    return (
      <div className="container mx-auto p-6">
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
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Email Templates</h1>
        <p className="text-gray-600">{event?.title}</p>
      </div>

      <div className="mb-6">
        <button
          onClick={() => {
            setEditingTemplate(null);
            setShowEditor(true);
          }}
          className="bg-gradient-to-br from-blue-600 to-purple-600 text-white px-4 py-2 rounded-lg hover:opacity-90"
        >
          + Create Template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600 mb-4">No email templates yet</p>
          <button
            onClick={() => setShowEditor(true)}
            className="text-blue-600 hover:text-blue-700"
          >
            Create your first template
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {templates.map((template) => (
            <div key={template.id} className="bg-white border rounded-lg p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-semibold text-lg">{template.name}</h3>
                  <p className="text-sm text-gray-600">
                    Sends: {getTriggerLabel(template.trigger_type)}
                  </p>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  template.enabled 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {template.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              
              <div className="mb-4">
                <p className="text-sm text-gray-700">
                  <strong>Subject:</strong> {template.subject}
                </p>
                <p className="text-sm text-gray-700 mt-2">
                  <strong>Preview:</strong> {template.body.substring(0, 150)}...
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditingTemplate(template);
                    setShowEditor(true);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(template.id)}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
