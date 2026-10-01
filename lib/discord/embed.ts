// Shared visual template for every bot-authored structured message
// (welcome message, event/panel announcements, role-change DMs) — same
// accent color and footer on all of them, so they read as one consistent
// "voice" instead of a pile of plain-text messages blending into whatever
// else is in the channel.

export const BRAND_COLOR = 0x2563eb; // blue-600, matches the app's own primary color
const FOOTER_TEXT = '123impact';

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  author?: { name: string; icon_url?: string };
  footer?: { text: string };
  timestamp?: string;
}

// The org hosting the event/panel, shown as the small line above the embed
// title (with their logo, when they have one) — without it, an announcement
// has no visible sign of which org it's actually from.
export function orgAuthor(org: { name: string; logo_url?: string | null }): { name: string; icon_url?: string } {
  return { name: org.name, ...(org.logo_url ? { icon_url: org.logo_url } : {}) };
}

export interface MessagePayload {
  content?: string;
  embeds?: DiscordEmbed[];
  components?: unknown[];
}

export function baseEmbed(overrides: Partial<DiscordEmbed> = {}): DiscordEmbed {
  return {
    color: BRAND_COLOR,
    footer: { text: FOOTER_TEXT },
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// A Discord "link" button (style 5) — opens a URL directly with no
// interaction webhook involved, so it works with nothing more than the
// message-send call itself.
export function linkButton(label: string, url: string) {
  return {
    type: 1, // action row
    components: [
      { type: 2, style: 5, label, url }, // type 2 = button, style 5 = link
    ],
  };
}
