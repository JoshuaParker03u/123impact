// Encodes/decodes the small amount of state Discord's stateless components
// and modals need carried in their custom_id (max 100 chars — a short
// prefix plus a UUID comfortably fits).

export function encodeCustomId(kind: string, id: string): string {
  return `${kind}:${id}`;
}

export function decodeCustomId(customId: string): { kind: string; id: string } | null {
  const idx = customId.indexOf(':');
  if (idx === -1) return null;
  return { kind: customId.slice(0, idx), id: customId.slice(idx + 1) };
}
