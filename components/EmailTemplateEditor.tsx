'use client';

import { useState } from 'react';
import { getAvailableVariables } from '@/lib/email-templates';

interface EmailTemplateEditorProps {
  eventId: string;
  template?: any;
  onSave: () => void;
  onCancel: () => void;
}

export default function EmailTemplateEditor({ 
  eventId, 
  template, 
  onSave, 
  onCancel 
}: EmailTemplateEditorProps) {
  const [name, setName] = useState(template?.name || '');
  const [subject, setSubject] = useState(template?.subject || '');
  const [body, setBody] = useState(template?.body || '');
  const [triggerType, setTriggerType] = useState(template?.trigger_type || 'signup');
  const [enabled, setEnabled] = useState(template?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [showVariables, setShowVariables] = useState(false);

  const variables = getAvailableVariables();

  async function handleSave() {
    if (!name || !subject || !body) {
      alert('Please fill in all fields');
      return;
    }

    setSaving(true);

    try {
      const method = template ? 'PUT' : 'POST';
      const payload = template
        ? { id: template.id, name, subject, body, trigger_type: triggerType, enabled }
        : { event_id: eventId, name, subject, body, trigger_type: triggerType, enabled };

      const response = await fetch('/api/templates', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        onSave();
      } else {
        const data = await response.json();
        alert(`Error: ${data.error}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  function insertVariable(variable: string) {
    setBody(body + `{{${variable}}}`);
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 space-y-4">
      <h3 className="text-xl font-bold">
        {template ? 'Edit Template' : 'Create Template'}
      </h3>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Template Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., Welcome Email"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          When to Send
        </label>
        <select
          value={triggerType}
          onChange={(e) => setTriggerType(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
        >
          <option value="signup">Immediately upon sign-up</option>
          <option value="7_days_before">7 days before shift</option>
          <option value="24_hours_before">24 hours before shift</option>
          <option value="1_hour_before">1 hour before shift</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Subject Line
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          placeholder="Email subject"
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email Body
          </label>
          <button
            onClick={() => setShowVariables(!showVariables)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            {showVariables ? 'Hide' : 'Show'} Variables
          </button>
        </div>
        
        {showVariables && (
          <div className="mb-2 p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Click to insert:</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(variables).map(([key, description]) => (
                <button
                  key={key}
                  onClick={() => insertVariable(key)}
                  className="text-xs px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100"
                  title={description}
                >
                  {`{{${key}}}`}
                </button>
              ))}
            </div>
          </div>
        )}

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          placeholder="Email content (use {{variable}} for dynamic content)"
        />
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
        <label htmlFor="enabled" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
          Template enabled (emails will be sent)
        </label>
      </div>

      <div className="flex gap-3 pt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-gradient-to-br from-blue-600 to-purple-600 text-white py-2 px-4 rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Template'}
        </button>
        <button
          onClick={onCancel}
          className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
