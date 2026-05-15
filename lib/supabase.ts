import { createClient } from '@supabase/supabase-js'
import { Database } from './database.types'
import { createBrowserClient } from '@supabase/ssr'

// Singleton browser client — one instance for the entire browser session.
// Never call createBrowserClient() inside a component; import this instead.
let _browser: ReturnType<typeof createBrowserClient> | null = null;
export function getBrowserClient(): ReturnType<typeof createBrowserClient> {
  if (!_browser) {
    _browser = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _browser!;
}

/** @deprecated use getBrowserClient() */
export const getSupabaseClient = getBrowserClient;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
