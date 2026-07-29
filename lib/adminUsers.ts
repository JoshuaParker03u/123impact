import type { SupabaseClient } from '@supabase/supabase-js';

// service.auth.admin.listUsers() is paginated (50/page by default) — calling
// it once and filtering client-side silently drops users past the first
// page. These helpers use non-paginated, targeted lookups instead so they
// work regardless of how many users a project has accumulated.

// Resolve many user ids at once (e.g. enriching a list of org members).
export async function getUsersByIds(service: SupabaseClient, userIds: string[]) {
  const results = await Promise.all(userIds.map((id) => service.auth.admin.getUserById(id)));
  const byId: Record<string, NonNullable<Awaited<ReturnType<typeof service.auth.admin.getUserById>>['data']['user']>> = {};
  results.forEach((res) => {
    if (res.data?.user) byId[res.data.user.id] = res.data.user;
  });
  return byId;
}

// Find a single user by email. There's no direct admin API for this, so it
// pages through listUsers() until a match is found or users are exhausted.
export async function findUserByEmail(service: SupabaseClient, email: string) {
  const target = email.toLowerCase();
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users?.length) return null;
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
}
