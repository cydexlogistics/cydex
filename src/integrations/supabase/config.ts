// The Supabase project the app talks to, read from the environment: `.env`
// when running locally, the hosting provider's environment variables (Vercel)
// in production. Pointing the app at another project only means changing these.
//
// Both values are public by design: the anon key can only do what the
// database's security rules allow. Never put the service_role key here.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. Copy .env.example to .env and fill them in ' +
      '(Supabase dashboard -> Project Settings -> API). See docs/DEPLOYMENT_CHECKLIST.md.',
  );
}

export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = anonKey;
