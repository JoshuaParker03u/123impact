import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

const envPath = resolve(__dirname, '../../.env.test');

if (!existsSync(envPath)) {
  throw new Error(
    '.env.test not found. Copy .env.test.example to .env.test and fill it in with ' +
    'the values `npm run db:test:up` (supabase start) prints — API URL, anon key, ' +
    'and service_role key for your LOCAL Supabase instance. Never point this at ' +
    'staging or production; these tests do real deletes.'
  );
}

dotenv.config({ path: envPath });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

// Hard safety check — these tests create and delete real rows. Refuse to run
// against anything that isn't obviously a local instance, no matter what
// .env.test says, so a copy-paste mistake can't point this at a real project.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(url)) {
  throw new Error(
    `NEXT_PUBLIC_SUPABASE_URL ("${url}") does not look like a local Supabase instance ` +
    '(expected http://127.0.0.1:54321 or similar). Refusing to run tests against it.'
  );
}

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('.env.test is missing NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY.');
}
