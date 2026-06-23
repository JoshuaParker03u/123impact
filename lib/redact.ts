export const REDACTED_NAME  = '█████ ██████';
export const REDACTED_EMAIL = '••••@••••.•••';
export const REDACTED_PHONE = '•••-•••-••••';

export function redactName(value: string | null | undefined): string {
  if (!value) return '';
  return REDACTED_NAME;
}

export function redactEmail(value: string | null | undefined): string {
  if (!value) return '';
  return REDACTED_EMAIL;
}

export function redactPhone(value: string | null | undefined): string {
  if (!value) return '';
  return REDACTED_PHONE;
}

/** Redact a value based on type; returns the original if streamer mode is off. */
export function redact(
  value: string | null | undefined,
  type: 'name' | 'email' | 'phone',
  streamerMode: boolean
): string {
  if (!streamerMode) return value ?? '';
  if (!value) return '';
  switch (type) {
    case 'name':  return REDACTED_NAME;
    case 'email': return REDACTED_EMAIL;
    case 'phone': return REDACTED_PHONE;
  }
}
