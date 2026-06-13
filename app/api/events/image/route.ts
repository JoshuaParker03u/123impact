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

// POST /api/events/image
// Uploads an event image to the event-images bucket, scoped to a caller's organization.
export async function POST(request: NextRequest) {
  try {
    const supabase = await buildSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const organizationId = formData.get('organization_id') as string | null;
    const imageFile       = formData.get('image_file')     as File   | null;

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 });
    }
    if (!imageFile || imageFile.size === 0) {
      return NextResponse.json({ error: 'image_file is required' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(imageFile.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPG, PNG, SVG, WebP.' },
        { status: 400 }
      );
    }
    if (imageFile.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5 MB.' },
        { status: 400 }
      );
    }

    const { data: membership } = await supabase
      .from('organization_admins')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const service = buildServiceClient();
    const ext      = imageFile.name.split('.').pop();
    const filename = `${organizationId}/${Date.now()}.${ext}`;
    const buffer   = Buffer.from(await imageFile.arrayBuffer());

    const { error: uploadError } = await service.storage
      .from('event-images')
      .upload(filename, buffer, { contentType: imageFile.type });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = service.storage
      .from('event-images')
      .getPublicUrl(filename);

    return NextResponse.json({ url: publicUrl });
  } catch (e: any) {
    console.error('[POST /api/events/image]', e);
    return NextResponse.json(
      { error: e.message ?? 'Internal server error' },
      { status: 500 }
    );
  }
}
