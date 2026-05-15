import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

type Props = { params: Promise<{ eventId: string }> };

export default async function Image({ params }: Props) {
  const { eventId } = await params;

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: event } = await service
    .from('events')
    .select('title, description, image_url, location, date, organizations(name, logo_url)')
    .eq('event_id', eventId)
    .maybeSingle();

  const orgName  = (event?.organizations as any)?.name  ?? '123impact';
  const logoUrl  = (event?.organizations as any)?.logo_url ?? null;
  const title    = event?.title ?? 'Volunteer Signup';
  const location = event?.location ?? '';
  const date     = event?.date
    ? new Date(event.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  // Fetch logo as base64 if available
  let logoData: string | null = null;
  if (logoUrl) {
    try {
      const res = await fetch(logoUrl);
      const buf = await res.arrayBuffer();
      const mime = res.headers.get('content-type') ?? 'image/png';
      logoData = `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
    } catch {}
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          padding: '60px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Org header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '40px' }}>
          {logoData ? (
            <img
              src={logoData}
              style={{ width: '56px', height: '56px', borderRadius: '12px', objectFit: 'cover' }}
            />
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '56px', height: '56px', borderRadius: '12px',
              background: 'linear-gradient(135deg, #2563eb, #9333ea)',
              color: 'white', fontSize: '20px', fontWeight: 700,
            }}>
              {orgName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span style={{ color: '#94a3b8', fontSize: '24px', fontWeight: 600 }}>{orgName}</span>
        </div>

        {/* Event title */}
        <div style={{
          color: 'white', fontSize: title.length > 40 ? '52px' : '64px',
          fontWeight: 800, lineHeight: 1.1, flex: 1,
          display: 'flex', alignItems: 'center',
        }}>
          {title}
        </div>

        {/* Footer meta */}
        <div style={{ display: 'flex', gap: '32px', marginTop: '40px' }}>
          {date && (
            <span style={{ color: '#60a5fa', fontSize: '22px', fontWeight: 500 }}>📅 {date}</span>
          )}
          {location && (
            <span style={{ color: '#60a5fa', fontSize: '22px', fontWeight: 500 }}>📍 {location}</span>
          )}
        </div>

        {/* 123impact watermark */}
        <div style={{
          position: 'absolute', bottom: '32px', right: '60px',
          color: '#475569', fontSize: '18px',
        }}>
          Powered by 123impact
        </div>
      </div>
    ),
    { ...size }
  );
}
