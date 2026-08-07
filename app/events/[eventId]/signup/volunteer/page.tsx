import { headers } from 'next/headers';
import { Suspense } from 'react';
import { fetchSignupBranding } from '@/lib/signupBranding';
import SignupPageClient from '../SignupPageClient';

type Props = { params: Promise<{ eventId: string }> };

export default async function VolunteerSignupPage({ params }: Props) {
  const headersList = await headers();
  const host = headersList.get('x-custom-host') ?? headersList.get('host') ?? '';
  const branding = await fetchSignupBranding(host.split(':')[0]);

  return (
    <Suspense>
      <SignupPageClient params={params} initialBranding={branding} role="volunteer" />
    </Suspense>
  );
}
