import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { sendEmail, filterOptedOut } from '@/lib/email';
import { wrapEmailHtml } from '@/lib/email-templates';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    // Get pending scheduled emails that are due
    const { data: emails } = await supabase
      .from('scheduled_emails')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .limit(100);

    if (!emails || emails.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    // Respect opt-outs that may have happened after the message was scheduled
    const allowed = new Set(
      await filterOptedOut(supabase, emails.map(e => e.volunteer_email))
    );

    // Look up org branding (name/logo) for each email's organization
    const orgIds = [...new Set(emails.map(e => e.organization_id).filter(Boolean))];
    const { data: orgs } = orgIds.length > 0
      ? await supabase.from('organizations').select('id, name, logo_url').in('id', orgIds)
      : { data: [] as any[] };
    const orgBrandingMap = new Map(
      (orgs ?? []).map((o: any) => [o.id, { name: o.name, logoUrl: o.logo_url }])
    );

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    const affectedMessageIds = new Set<string>();

    for (const email of emails) {
      if (email.message_id) affectedMessageIds.add(email.message_id);

      if (!allowed.has(email.volunteer_email)) {
        // Recipient opted out since scheduling — cancel, don't send
        await supabase
          .from('scheduled_emails')
          .update({ status: 'cancelled', error_message: 'Recipient opted out' })
          .eq('id', email.id);
        skippedCount++;
        continue;
      }

      try {
        const htmlContent = wrapEmailHtml(email.body.replace(/\n/g, '<br>'), orgBrandingMap.get(email.organization_id));

        const result = await sendEmail({
          to: email.volunteer_email,
          subject: email.subject,
          html: htmlContent,
        });

        if (result.success) {
          await supabase
            .from('scheduled_emails')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', email.id);
          successCount++;
        } else {
          await supabase
            .from('scheduled_emails')
            .update({
              status: 'failed',
              error_message: result.error
            })
            .eq('id', email.id);
          failCount++;
        }
      } catch (error: any) {
        await supabase
          .from('scheduled_emails')
          .update({
            status: 'failed',
            error_message: error.message
          })
          .eq('id', email.id);
        failCount++;
      }
    }

    // Update the messages record for each affected message_id
    const now = new Date().toISOString();
    for (const messageId of affectedMessageIds) {
      const { data: remaining } = await supabase
        .from('scheduled_emails')
        .select('id')
        .eq('message_id', messageId)
        .eq('status', 'pending')
        .limit(1);

      if (!remaining || remaining.length === 0) {
        // All emails processed — check if any failed
        const { data: failed } = await supabase
          .from('scheduled_emails')
          .select('id')
          .eq('message_id', messageId)
          .eq('status', 'failed')
          .limit(1);

        await supabase
          .from('messages')
          .update({
            delivery_status: failed && failed.length > 0 ? 'failed' : 'delivered',
            sent_at: now,
          })
          .eq('id', messageId);
      }
    }

    return NextResponse.json({
      processed: emails.length,
      success: successCount,
      failed: failCount,
      skipped: skippedCount
    });
  } catch (error: any) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}