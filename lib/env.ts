/**
 * Server-side environment validation.
 * Imported by instrumentation.ts — throws at startup if required vars are missing
 * so the app never silently runs with broken config.
 */

const REQUIRED = [
  // Supabase
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',

  // Email
  'MAILERSEND_API_KEY',
  'MAILERSEND_FROM_EMAIL',

  // Stripe
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_MONTHLY_PRICE_ID',
  'STRIPE_ANNUAL_PRICE_ID',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',

  // Security
  'CRON_SECRET',
] as const;

const OPTIONAL = [
  // Used in email/invite links — falls back to request origin if absent
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SITE_URL',

  // Google Places autocomplete
  'GOOGLE_PLACES_API_KEY',

  // Eventbrite OAuth integration
  'EVENTBRITE_CLIENT_ID',
  'EVENTBRITE_CLIENT_SECRET',

  // Vercel API (custom domain management)
  'VERCEL_API_TOKEN',
  'VERCEL_PROJECT_ID',
  'VERCEL_TEAM_ID',

  // Email display name
  'MAILERSEND_FROM_NAME',
] as const;

export function validateEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map((k) => `  - ${k}`).join('\n')}\n\nSee .env.example for the full list.`
    );
  }

  const missingOptional = OPTIONAL.filter((key) => !process.env[key]);
  if (missingOptional.length > 0) {
    console.warn(
      `[env] Optional environment variables not set (some features may be disabled):\n${missingOptional.map((k) => `  - ${k}`).join('\n')}`
    );
  }
}
