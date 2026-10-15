// Regression test for a real bug found while planning the Discord bot
// /signup rework: a recipient list containing a null email (a Discord-only
// signup) crashed the entire send, and even before that, naive email-based
// deduping collapsed every distinct null-email recipient into one, dropping
// the rest from the count before anything was sent.
import { describe, it, expect } from 'vitest';
import { dedupeRecipients, extractSendableEmails } from '@/lib/messages/dedupe-recipients';

describe('dedupeRecipients', () => {
  it('dedupes recipients that share the same email', () => {
    const result = dedupeRecipients([
      { name: 'Alex', email: 'alex@example.com' },
      { name: 'Alex (dup)', email: 'alex@example.com' },
      { name: 'Jordan', email: 'jordan@example.com' },
    ]);
    expect(result).toEqual([
      { name: 'Alex', email: 'alex@example.com' },
      { name: 'Jordan', email: 'jordan@example.com' },
    ]);
  });

  it('keeps every distinct null-email (Discord-only) recipient, rather than collapsing them into one', () => {
    const result = dedupeRecipients([
      { name: 'Riley', email: null, discord_user_id: 'discord-1' },
      { name: 'Sam', email: null, discord_user_id: 'discord-2' },
      { name: 'Taylor', email: null, discord_user_id: 'discord-3' },
    ]);
    expect(result).toHaveLength(3);
  });

  it('handles a mixed batch of real emails and null-email Discord recipients correctly', () => {
    const result = dedupeRecipients([
      { name: 'Alex', email: 'alex@example.com' },
      { name: 'Alex (dup)', email: 'alex@example.com' },
      { name: 'Riley', email: null, discord_user_id: 'discord-1' },
      { name: 'Sam', email: null, discord_user_id: 'discord-2' },
    ]);
    expect(result).toHaveLength(3);
  });
});

describe('extractSendableEmails', () => {
  it('returns only non-null emails, dropping Discord-only recipients entirely', () => {
    const result = extractSendableEmails([
      { name: 'Alex', email: 'alex@example.com' },
      { name: 'Riley', email: null, discord_user_id: 'discord-1' },
      { name: 'Jordan', email: 'jordan@example.com' },
    ]);
    expect(result).toEqual(['alex@example.com', 'jordan@example.com']);
  });

  it('returns an empty array when every recipient is Discord-only', () => {
    const result = extractSendableEmails([
      { name: 'Riley', email: null, discord_user_id: 'discord-1' },
    ]);
    expect(result).toEqual([]);
  });
});
