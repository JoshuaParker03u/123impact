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
  footer?: { text: string };
  timestamp?: string;
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
