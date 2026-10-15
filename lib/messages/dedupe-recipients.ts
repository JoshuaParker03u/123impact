// Shared by app/api/messages/send/route.ts (and could be reused by any
// future bulk-recipient path). Extracted so the exact bug this fixes --
// collapsing every distinct Discord-only recipient into one, and crashing
// the whole send on a null email -- has real regression coverage without
// needing to simulate the route's session-cookie auth in a test.
export interface MessageRecipient {
  name: string;
  email: string | null;
  discord_user_id?: string | null;
}

// Dedup by email, but only among recipients that actually have one. A
// Discord-only signup (no email -- see the Discord bot /signup rework) has
// email: null; naively deduping on email would collapse every distinct
// Discord-only person into a single entry, silently dropping the rest
// before any send happens.
export function dedupeRecipients<T extends MessageRecipient>(recipients: T[]): T[] {
  const seenEmails = new Set<string>();
  return recipients.filter((r) => {
    if (!r.email) return true;
    if (seenEmails.has(r.email)) return false;
    seenEmails.add(r.email);
    return true;
  });
}

// Only recipients with a real email are candidates for the email send/
// opt-out check -- passing a null through to filterOptedOut (which calls
// .toLowerCase() on every entry) throws and aborts delivery to the entire
// batch, not just the recipient with no email.
export function extractSendableEmails<T extends MessageRecipient>(recipients: T[]): string[] {
  return recipients
    .map((r) => r.email)
    .filter((email): email is string => !!email);
}
