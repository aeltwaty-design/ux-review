import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set (see .env.example). */
export const configured = Boolean(url && key);

export const supabase = createClient(url ?? 'https://not-configured.supabase.co', key ?? 'not-configured', {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const ALLOWED_DOMAIN = 'walaplus.com';
export const BUCKET = 'screenshots';
