import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// The role-picker used to live here; signups now go through a dedicated
// page per role (/signup/volunteer, /signup/attendee, /signup/speaker).
// Existing shared links (QR codes, emails) still point at this bare URL, so
// redirect them to the Volunteer flow — the role this page always defaulted
// to — instead of breaking them.
export default async function SignupPage({ params, searchParams }: Props) {
  const { eventId } = await params;
  const query = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') qs.set(key, value);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  redirect(`/events/${eventId}/signup/volunteer${suffix}`);
}
