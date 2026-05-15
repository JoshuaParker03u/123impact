import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type Params = { params: Promise<{ token: string }> };

// POST /api/verify-domain/[token]
// Public no-login endpoint. Marks domain as pending_verification and returns details
// so the verify-domain page can display org info and trigger full DNS check.
export async function POST(_req: NextRequest, { params }: Params) {
  const { token } = await params;

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: domain } = await service
    .from('org_custom_domains')
    .select('id, organization_id, subdomain, verification_token, token_expires_at, status')
    .eq('verification_token', token)
    .maybeSingle();

  if (!domain) return NextResponse.json({ error: 'Verification link not found' }, { status: 404 });
  if (new Date(domain.token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This verification link has expired. Ask the org admin to resend the instructions.' }, { status: 410 });
  }

  // Fetch org name
  const { data: org } = await service
    .from('organizations').select('name').eq('id', domain.organization_id).single();

  // Advance status to pending_verification
  if (domain.status === 'email_sent') {
    await service.from('org_custom_domains').update({
      status:     'pending_verification',
      updated_at: new Date().toISOString(),
    }).eq('id', domain.id);
  }

  return NextResponse.json({
    organization_id: domain.organization_id,
    org_name:   (org as any)?.name ?? 'Unknown Organization',
    subdomain:  domain.subdomain,
    cname_name:  domain.subdomain,
    cname_value: 'cname.vercel-dns.com',
    txt_name:    `_123impact-verify.${domain.subdomain}`,
    txt_value:   domain.verification_token,
  });
}
