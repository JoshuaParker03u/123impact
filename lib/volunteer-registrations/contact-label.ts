// A registration's displayable contact identity — email for everyone who has
// one, falling back to the Discord handle captured at bot-signup time for the
// email-less Discord-only signups introduced alongside nullable email. Null
// only when neither is on file (shouldn't happen in practice: every
// registration has at least one or the other, enforced at signup).
export function contactLabel(r: { email?: string | null; discord_username?: string | null }): string | null {
  if (r.email) return r.email;
  if (r.discord_username) return `@${r.discord_username}`;
  return null;
}
