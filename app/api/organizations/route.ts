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
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/organizations
// Creates a new organization and adds the authenticated user as owner.
export async function POST(request: NextRequest) {
  try {
    const supabase = await buildSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = buildServiceClient();
    const formData = await request.formData();

    const name         = formData.get('name')          as string | null;
    const description  = formData.get('description')   as string | null;
    const contactEmail = formData.get('contact_email') as string | null;
    const contactPhone = formData.get('contact_phone') as string | null;
    const website      = formData.get('website')       as string | null;
    const logoUrlInput = formData.get('logo_url')      as string | null;
    const logoFile     = formData.get('logo_file')     as File   | null;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
    }

    if (!contactEmail?.trim()) {
      return NextResponse.json({ error: 'Contact email is required' }, { status: 400 });
    }
    if (!EMAIL_REGEX.test(contactEmail.trim())) {
      return NextResponse.json({ error: 'Enter a valid contact email address' }, { status: 400 });
    }

    // ── Handle logo upload ──────────────────────────────────────────────────
    let finalLogoUrl: string | null = logoUrlInput?.trim() || null;

    if (logoFile && logoFile.size > 0) {
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
      const filename = `${Date.now()}.${ext}`;
      const buffer   = Buffer.from(await logoFile.arrayBuffer());

      const { error: uploadError } = await service.storage
        .from('organization-logos')
        .upload(filename, buffer, { contentType: logoFile.type });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = service.storage
        .from('organization-logos')
        .getPublicUrl(filename);

      finalLogoUrl = publicUrl;
    }

    // ── Create organization ─────────────────────────────────────────────────
    // Uses service role — no INSERT RLS policy exists on organizations (circular
    // bootstrap problem: you can't be admin of an org that doesn't exist yet).
    const { data: org, error: orgError } = await service
      .from('organizations')
      .insert({
        name:          name.trim(),
        description:   description?.trim()  || null,
        contact_email: contactEmail?.trim() || null,
        contact_phone: contactPhone?.trim() || null,
        website:       website?.trim()      || null,
        logo_url:      finalLogoUrl,
        status:        'active',
      })
      .select()
      .single();

    if (orgError) throw orgError;

    // ── Add creator as owner ────────────────────────────────────────────────
    const { error: adminError } = await service
      .from('organization_admins')
      .insert({
        organization_id: org.id,
        user_id:         user.id,
        role:            'owner',
        permissions:     {},
      });

    if (adminError) throw adminError;

    return NextResponse.json(
      {
        data: {
          id:          org.id,
          name:        org.name,
          logo_url:    org.logo_url,
          status:      org.status,
          role:        'owner',
          permissions: {},
        },
      },
      { status: 201 }
    );
  } catch (e: any) {
    console.error('[POST /api/organizations]', e);
    return NextResponse.json(
      { error: e.message ?? 'Internal server error' },
      { status: 500 }
    );
  }
}
