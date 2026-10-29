import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ALLOWED_DOMAIN, configured, supabase } from '../lib/supabase';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!configured);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    const params = new URLSearchParams(location.search);
    if (params.get('error_description')) setAuthError(params.get('error_description'));
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s && location.search) history.replaceState(null, '', location.pathname + location.hash); // drop ?code= after the OAuth return
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Belt and braces: the database already refuses other domains at sign-up; here we also keep the UI honest.
  useEffect(() => {
    const email = session?.user.email?.toLowerCase() ?? '';
    if (session && !email.endsWith('@' + ALLOWED_DOMAIN)) {
      setAuthError(`Only ${ALLOWED_DOMAIN} accounts can use UX Reviews.`);
      supabase.auth.signOut();
    }
  }, [session]);

  const signIn = useCallback(async () => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname, queryParams: { hd: ALLOWED_DOMAIN, prompt: 'select_account' } },
    });
    if (error) setAuthError(error.message);
  }, []);
  const signOut = useCallback(() => supabase.auth.signOut(), []);

  return { session, user: session?.user ?? null, ready, authError, signIn, signOut };
}
