import { ALLOWED_DOMAIN } from '../lib/supabase';

export function SignIn({ onSignIn, error }: { onSignIn: () => void; error: string | null }) {
  return (
    <div className="signin"><div className="signin-card">
      <h2>UX Reviews</h2>
      <p>Engineers raise review requests, the UX team delivers findings, and both track what is solved. Sign in with your {ALLOWED_DOMAIN} Google account.</p>
      {error && <div className="note-bar" style={{ marginBottom: 14 }}>{error}</div>}
      <button className="btn primary" type="button" onClick={onSignIn}>Sign in with Google</button>
    </div></div>
  );
}
