import { createClient } from '@supabase/supabase-js';

const env = import.meta.env as Record<string, string | undefined>;
// VITE_* from .env.local / Vercel, or the NEXT_PUBLIC_* names the Vercel ↔ Supabase integration creates automatically.
const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** False until the Supabase URL and public key are set (see .env.example). */
export const configured = Boolean(url && key);

export const supabase = createClient(url ?? 'https://not-configured.supabase.co', key ?? 'not-configured', {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const ALLOWED_DOMAIN = 'walaplus.com';
export const BUCKET = 'screenshots';
