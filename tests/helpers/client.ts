import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _service: SupabaseClient | null = null;
let _anon: SupabaseClient | null = null;

// Service-role client — bypasses RLS, used for fixture setup/teardown and
// for exercising routes that are themselves service-role-only.
export function getServiceClient(): SupabaseClient {
  if (!_service) {
    _service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return _service;
}

// Anon-key client — subject to RLS, same as the real browser app. Needed
// specifically for tests/rls-boundaries.test.ts, where using the service
// client would defeat the point of the test.
export function getAnonClient(): SupabaseClient {
  if (!_anon) {
    _anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return _anon;
}
