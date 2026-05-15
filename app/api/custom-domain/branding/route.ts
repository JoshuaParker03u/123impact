import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// GET /api/custom-domain/branding?host={hostname}
// Public endpoint. Returns branding config for an active custom domain.
export async function GET(req: NextRequest) {
  const host = req.nextUrl.searchParams.get('host');
  if (!host) return NextResponse.json(null);

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data } = await service
    .from('org_custom_domains')
    .select('organization_id, primary_color, secondary_color, banner_image_url, header_links')
    .eq('subdomain', host.toLowerCase())
    .eq('status', 'active')
    .maybeSingle();

  if (!data) return NextResponse.json(null);

  // Fetch org name + logo for the header
  const { data: org } = await service
    .from('organizations')
    .select('name, logo_url')
    .eq('id', (data as any).organization_id)
    .single();

  return NextResponse.json({
    primary_color:    (data as any).primary_color ?? null,
    secondary_color:  (data as any).secondary_color ?? null,
    banner_image_url: (data as any).banner_image_url ?? null,
    header_links:     (data as any).header_links ?? [],
    org_name:         (org as any)?.name ?? null,
    org_logo:         (org as any)?.logo_url ?? null,
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  });
}
