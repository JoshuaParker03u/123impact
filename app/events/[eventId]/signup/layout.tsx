import { createClient } from '@supabase/supabase-js';
import type { Metadata } from 'next';

type Props = { params: Promise<{ eventId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
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

  if (!event) {
    return { title: 'Volunteer Signup — 123impact' };
  }

  const orgName = (event.organizations as any)?.name ?? '123impact';
  const title = `${event.title} — ${orgName}`;
  const description = event.description
    ? event.description.slice(0, 160)
    : `Sign up to volunteer for ${event.title} hosted by ${orgName}.`;
  const image = event.image_url ?? `${process.env.NEXT_PUBLIC_APP_URL}/og-default.png`;
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventId}/signup`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      images: [{ url: image, width: 1200, height: 630, alt: event.title }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
