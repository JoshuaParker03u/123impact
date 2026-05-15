import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { Suspense } from 'react';
import SignupPageClient from './SignupPageClient';

type Props = { params: Promise<{ eventId: string }> };

const KNOWN_HOSTS = ['123impact.org', 'www.123impact.org', 'localhost', '127.0.0.1'];

async function fetchBranding(host: string) {
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
    .maybeSingle();

  if (!data) return null;

  const { data: org } = await service
    .from('organizations')
    .select('name, logo_url')
    .eq('id', (data as any).organization_id)
    .single();

  return {
    primary_color:    (data as any).primary_color ?? null,
    secondary_color:  (data as any).secondary_color ?? null,
    banner_image_url: (data as any).banner_image_url ?? null,
    header_links:     (data as any).header_links ?? [],
    org_name:         (org as any)?.name ?? null,
    org_logo:         (org as any)?.logo_url ?? null,
  };
}

export default async function SignupPage({ params }: Props) {
  const headersList = await headers();
  const host = headersList.get('x-custom-host') ?? headersList.get('host') ?? '';
  const branding = await fetchBranding(host.split(':')[0]);

  return (
    <Suspense>
      <SignupPageClient params={params} initialBranding={branding} />
    </Suspense>
  );
}
