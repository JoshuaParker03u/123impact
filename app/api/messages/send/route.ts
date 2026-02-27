import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { sendBulkEmail } from '@/lib/email';
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
  const { subject, message, recipientType, eventId, shiftId, scheduledFor } = body;

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

  try {
    let recipients: { name: string; email: string }[] = [];

    if (recipientType === 'event' && eventId) {
      const { data: shifts } = await serviceSupabase
        .from('shifts')
        .select('id')
        .eq('event_id', eventId);

      const shiftIds = shifts?.map((s: any) => s.id) || [];

      if (shiftIds.length > 0) {
        const { data } = await serviceSupabase
          .from('volunteer_registrations')
          .select('name, email')
          .in('shift_id', shiftIds);
        recipients = data || [];
      }
    } else if (recipientType === 'shift' && shiftId) {
      const { data } = await serviceSupabase
        .from('volunteer_registrations')
        .select('name, email')
        .eq('shift_id', shiftId);
      recipients = data || [];
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
    const htmlContent = wrapEmailHtml(message.replace(/\n/g, '<br>'));

    const result = await sendBulkEmail({
      to:      emails[0],
      bcc:     emails.slice(1),
      subject,
      html:    htmlContent,
    });

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