import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { sendBulkEmail, filterOptedOut } from '@/lib/email';
import { wrapEmailHtml } from '@/lib/email-templates';

export async function POST(request: Request) {
  const cookieStore = await cookies();

  // Session client — used only for auth verification (respects cookies)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  // Service client — used for all data reads/writes to bypass RLS
  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { subject, message, recipientType, eventId, shiftId, volunteerEmail, volunteerName, scheduledFor, waitlistFilter = 'all' } = body;

  // Resolve organization_id via service client
  let organizationId: string | null = null;
  if (eventId) {
    const { data: ev } = await serviceSupabase
      .from('events')
      .select('organization_id')
      .eq('id', eventId)
      .single();
    organizationId = ev?.organization_id ?? null;
  }
  if (!organizationId) {
    const { data: oa } = await serviceSupabase
      .from('organization_admins')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();
    organizationId = oa?.organization_id ?? null;
  }

  if (!organizationId) {
    return NextResponse.json({ error: 'No organization found' }, { status: 400 });
  }

  // Verify the caller is an admin/member of the resolved org before exposing
  // its volunteers' contact info or sending on its behalf.
  const { data: membership } = await serviceSupabase
    .from('organization_admins')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: org } = await serviceSupabase
    .from('organizations')
    .select('name, logo_url')
    .eq('id', organizationId)
    .single();
  const branding = { name: org?.name, logoUrl: (org as any)?.logo_url };

  try {
    let recipients: { name: string; email: string }[] = [];

    if (recipientType === 'event' && eventId) {
      const { data: shifts } = await serviceSupabase
        .from('shifts')
        .select('id')
        .eq('event_id', eventId);

      const shiftIds = shifts?.map((s: any) => s.id) || [];

      if (shiftIds.length > 0) {
        let query = serviceSupabase
          .from('volunteer_registrations')
          .select('name, email')
          .in('shift_id', shiftIds);
        if (waitlistFilter !== 'all') {
          query = query.eq('is_waitlisted', waitlistFilter === 'waitlisted');
        }
        const { data } = await query;
        recipients = data || [];
      }
    } else if (recipientType === 'shift' && shiftId) {
      let query = serviceSupabase
        .from('volunteer_registrations')
        .select('name, email')
        .eq('shift_id', shiftId);
      if (waitlistFilter !== 'all') {
        query = query.eq('is_waitlisted', waitlistFilter === 'waitlisted');
      }
      const { data } = await query;
      recipients = data || [];
    } else if (recipientType === 'volunteer' && volunteerEmail) {
      recipients = [{ name: volunteerName || '', email: volunteerEmail }];
    }

    // Deduplicate by email
    const uniqueRecipients = recipients.filter((r, i, self) =>
      i === self.findIndex(x => x.email === r.email)
    );

    const recipientCount = uniqueRecipients.length;
    if (recipientCount === 0) {
      return NextResponse.json({ error: 'No recipients found' }, { status: 400 });
    }

    const emails = uniqueRecipients.map(r => r.email);

    // ── Scheduled send ──────────────────────────────────────────────────────
    if (scheduledFor) {
      const scheduledAt = new Date(scheduledFor).toISOString();

      // Insert the message record first so we have an ID to link against
      const { data: msgRecord, error: msgError } = await serviceSupabase
        .from('messages')
        .insert({
          organization_id:  organizationId,
          subject,
          body:             message,
          recipient_type:   recipientType,
          recipient_emails: emails,
          event_id:         eventId || null,
          shift_id:         shiftId || null,
          sent_by:          user.id,
          recipient_count:  recipientCount,
          delivery_status:  'scheduled',
          scheduled_for:    scheduledAt,
        })
        .select('id')
        .single();

      if (msgError || !msgRecord) {
        console.error('Failed to create message record:', msgError);
        return NextResponse.json({ error: 'Failed to schedule message' }, { status: 500 });
      }

      const scheduledRows = uniqueRecipients.map(r => ({
        message_id:      msgRecord.id,
        organization_id: organizationId,
        volunteer_name:  r.name,
        volunteer_email: r.email,
        subject,
        body:            message,
        scheduled_for:   scheduledAt,
        status:          'pending',
        event_id:        eventId || null,
        shift_id:        shiftId || null,
      }));

      const { error: scheduleError } = await serviceSupabase
        .from('scheduled_emails')
        .insert(scheduledRows);

      if (scheduleError) {
        console.error('Failed to insert scheduled_emails:', scheduleError);
        // Roll back the message record
        await serviceSupabase.from('messages').delete().eq('id', msgRecord.id);
        return NextResponse.json({ error: scheduleError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, scheduled: true, recipientCount });
    }

    // ── Immediate send ──────────────────────────────────────────────────────
    const htmlContent = wrapEmailHtml(message.replace(/\n/g, '<br>'), branding);

    const allowedEmails = await filterOptedOut(serviceSupabase, emails);
    const result = await sendBulkEmail(
      allowedEmails.map(to => ({ to, subject, html: htmlContent }))
    );

    const deliveryStatus = result.success ? 'delivered' : 'failed';

    const { error: insertError } = await serviceSupabase.from('messages').insert({
      organization_id:  organizationId,
      subject,
      body:             message,
      recipient_type:   recipientType,
      recipient_emails: emails,
      event_id:         eventId || null,
      shift_id:         shiftId || null,
      sent_by:          user.id,
      recipient_count:  recipientCount,
      delivery_status:  deliveryStatus,
      error_message:    result.success ? null : result.error,
    });

    if (insertError) {
      console.error('Failed to save message record:', insertError);
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, recipientCount });
  } catch (error: any) {
    console.error('Send message error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}