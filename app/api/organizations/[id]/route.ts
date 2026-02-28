import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

async function buildSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch { /* server component — safe to ignore */ }
        },
      },
    }
  );
}

function buildServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024;

type Params = { params: Promise<{ id: string }> };

// GET /api/organizations/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = await buildSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify membership
    const { data: membership } = await supabase
      .from('organization_admins')
      .select('role')
      .eq('organization_id', id)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const service = buildServiceClient();
    const { data: org, error } = await service
      .from('organizations')
      .select('id, name, description, contact_email, contact_phone, website, logo_url, status')
      .eq('id', id)
      .single();

    if (error || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    return NextResponse.json({ data: { ...org, role: membership.role } });
  } catch (e: any) {
    console.error('[GET /api/organizations/[id]]', e);
    return NextResponse.json({ error: e.message ?? 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/organizations/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = await buildSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only owners and admins can edit
    const { data: membership } = await supabase
      .from('organization_admins')
      .select('role')
      .eq('organization_id', id)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const service = buildServiceClient();
    const formData = await req.formData();

    const name         = formData.get('name')          as string | null;
    const description  = formData.get('description')   as string | null;
    const contactEmail = formData.get('contact_email') as string | null;
    const contactPhone = formData.get('contact_phone') as string | null;
    const website      = formData.get('website')       as string | null;
    const status       = formData.get('status')        as string | null;
    const logoUrlInput = formData.get('logo_url')      as string | null;
    const logoFile     = formData.get('logo_file')     as File   | null;
    const clearLogo    = formData.get('clear_logo')    as string | null;

    if (name !== null && !name.trim()) {
      return NextResponse.json({ error: 'Organization name cannot be empty' }, { status: 400 });
    }

    // ── Handle logo ─────────────────────────────────────────────────────────
    let logoUrlUpdate: string | null | undefined = undefined; // undefined = don't change

    if (clearLogo === 'true') {
      logoUrlUpdate = null;
    } else if (logoFile && logoFile.size > 0) {
      if (!ALLOWED_TYPES.includes(logoFile.type)) {
        return NextResponse.json(
          { error: 'Invalid file type. Allowed: JPG, PNG, SVG, WebP.' },
          { status: 400 }
        );
      }
      if (logoFile.size > MAX_SIZE) {
        return NextResponse.json(
          { error: 'File too large. Maximum size is 5 MB.' },
          { status: 400 }
        );
      }

      const ext      = logoFile.name.split('.').pop();
      const filename = `${id}-${Date.now()}.${ext}`;
      const buffer   = Buffer.from(await logoFile.arrayBuffer());

      const { error: uploadError } = await service.storage
        .from('organization-logos')
        .upload(filename, buffer, { contentType: logoFile.type, upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = service.storage
        .from('organization-logos')
        .getPublicUrl(filename);

      logoUrlUpdate = publicUrl;
    } else if (logoUrlInput !== null) {
      logoUrlUpdate = logoUrlInput.trim() || null;
    }

    // ── Build update payload ─────────────────────────────────────────────────
    const updates: Record<string, any> = {};
    if (name         !== null) updates.name          = name.trim();
    if (description  !== null) updates.description   = description.trim()  || null;
    if (contactEmail !== null) updates.contact_email = contactEmail.trim() || null;
    if (contactPhone !== null) updates.contact_phone = contactPhone.trim() || null;
    if (website      !== null) updates.website       = website.trim()      || null;
    if (status       !== null) updates.status        = status;
    if (logoUrlUpdate !== undefined) updates.logo_url = logoUrlUpdate;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: org, error: updateError } = await service
      .from('organizations')
      .update(updates)
      .eq('id', id)
      .select('id, name, description, contact_email, contact_phone, website, logo_url, status')
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ data: { ...org, role: membership.role } });
  } catch (e: any) {
    console.error('[PATCH /api/organizations/[id]]', e);
    return NextResponse.json({ error: e.message ?? 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/organizations/[id]
// Only the owner can delete. Cascades to events, shifts, registrations, admins via DB FK.
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = await buildSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only owners may delete
    const { data: membership } = await supabase
      .from('organization_admins')
      .select('role')
      .eq('organization_id', id)
      .eq('user_id', user.id)
      .single();

    if (!membership || membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the organization owner can delete it' }, { status: 403 });
    }

    const service = buildServiceClient();

    // 1. Get all events for this org
    const { data: events } = await service
      .from('events')
      .select('id')
      .eq('organization_id', id);

    const eventIds = (events ?? []).map((e: any) => e.id);

    if (eventIds.length > 0) {
      // 2. Get all shifts for those events
      const { data: shifts } = await service
        .from('shifts')
        .select('id')
        .in('event_id', eventIds);

      const shiftIds = (shifts ?? []).map((s: any) => s.id);

      // 3. Delete volunteer registrations for those shifts
      if (shiftIds.length > 0) {
        await service
          .from('volunteer_registrations')
          .delete()
          .in('shift_id', shiftIds);
      }

      // 4. Delete pending scheduled emails for those events
      await service
        .from('scheduled_emails')
        .delete()
        .in('event_id', eventIds)
        .eq('status', 'pending');

      // 5. Delete scheduled messages for those events
      await service
        .from('messages')
        .delete()
        .in('event_id', eventIds)
        .eq('delivery_status', 'scheduled');

      // 6. Delete the events (DB cascades to shifts)
      await service
        .from('events')
        .delete()
        .in('id', eventIds);
    }

    // 7. Delete org admins and volunteers
    await service.from('organization_admins').delete().eq('organization_id', id);
    await service.from('organization_volunteers').delete().eq('organization_id', id);

    // 8. Delete the organization
    const { error: deleteError } = await service
      .from('organizations')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    return new NextResponse(null, { status: 204 });
  } catch (e: any) {
    console.error('[DELETE /api/organizations/[id]]', e);
    return NextResponse.json({ error: e.message ?? 'Internal server error' }, { status: 500 });
  }
}
