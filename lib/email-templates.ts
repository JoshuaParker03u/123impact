export function parseEmailTemplate(
  template: string,
  variables: Record<string, any>
): string {
  let result = template;
  
  // Replace {{variable}} with actual values
  Object.keys(variables).forEach((key) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, variables[key] || '');
  });
  
  return result;
}

export function getAvailableVariables() {
  return {
    volunteer_name: 'Volunteer\'s full name',
    volunteer_email: 'Volunteer\'s email',
    event_name: 'Event name',
    event_description: 'Event description',
    shift_date: 'Shift date',
    shift_start_time: 'Shift start time',
    shift_end_time: 'Shift end time',
    shift_location: 'Shift location',
    hours_until_shift: 'Hours until shift starts',
  };
}

export interface EmailBranding {
  name?: string | null;
  logoUrl?: string | null;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function wrapEmailHtml(content: string, branding?: EmailBranding): string {
  const orgName = escapeHtml(branding?.name?.trim() || 'Volunteer Platform');
  const logoUrl = branding?.logoUrl;

  const headerInner = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${orgName}" style="max-height:48px;max-width:240px;" />`
    : `<h1>${orgName}</h1>`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: #2563eb;
      color: white;
      padding: 20px;
      border-radius: 8px 8px 0 0;
      text-align: center;
    }
    .content {
      background: #f9fafb;
      padding: 30px;
      border-radius: 0 0 8px 8px;
    }
    .footer {
      text-align: center;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="header">
    ${headerInner}
  </div>
  <div class="content">
    ${content}
  </div>
  <div class="footer">
    <p>This is an automated message from ${orgName}.</p>
  </div>
</body>
</html>
  `.trim();
}
