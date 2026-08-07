import { createClient } from '@supabase/supabase-js';

const KNOWN_HOSTS = ['123impact.org', 'www.123impact.org', 'localhost', '127.0.0.1'];

export type BrandingData = {
  primary_color: string | null;
  secondary_color: string | null;
  banner_image_url: string | null;
  header_links: { label: string; url: string }[];
  org_name: string | null;
  org_logo: string | null;
};

export async function fetchSignupBranding(host: string): Promise<BrandingData | null> {
  const isCustom = host && !KNOWN_HOSTS.some(h => host === h || host.endsWith('.' + h)) && !host.includes('vercel.app');
  if (!isCustom) return null;

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
    .maybeSingle<{
      organization_id: string;
      primary_color: string | null;
      secondary_color: string | null;
      banner_image_url: string | null;
      header_links: { label: string; url: string }[] | null;
    }>();

  if (!data) return null;

  const { data: org } = await service
    .from('organizations')
    .select('name, logo_url')
    .eq('id', data.organization_id)
    .single<{ name: string; logo_url: string | null }>();

  return {
    primary_color:    data.primary_color ?? null,
    secondary_color:  data.secondary_color ?? null,
    banner_image_url: data.banner_image_url ?? null,
    header_links:     data.header_links ?? [],
    org_name:         org?.name ?? null,
    org_logo:         org?.logo_url ?? null,
  };
}
