import { createServerClient } from '@supabase/ssr';
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

// GET /api/places/autocomplete?input=...
// Server-side proxy for the Google Places Autocomplete API so the API key
// never reaches the browser. Used for location typeahead on the event form.
export async function GET(request: NextRequest) {
  try {
    const supabase = await buildSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const input = request.nextUrl.searchParams.get('input')?.trim();
    if (!input) {
      return NextResponse.json({ suggestions: [] });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Location search is not configured' }, { status: 503 });
    }

    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify({ input }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[GET /api/places/autocomplete] Google error', res.status, body);
      return NextResponse.json({ error: 'Location search failed' }, { status: 502 });
    }

    const data = await res.json();
    const suggestions = (data.suggestions ?? [])
      .filter((s: any) => s.placePrediction)
      .map((s: any) => ({
        placeId: s.placePrediction.placeId,
        text: s.placePrediction.text?.text ?? '',
        mainText: s.placePrediction.structuredFormat?.mainText?.text ?? '',
        secondaryText: s.placePrediction.structuredFormat?.secondaryText?.text ?? '',
      }));

    return NextResponse.json({ suggestions });
  } catch (e: any) {
    console.error('[GET /api/places/autocomplete]', e);
    return NextResponse.json({ error: e.message ?? 'Internal server error' }, { status: 500 });
  }
}
